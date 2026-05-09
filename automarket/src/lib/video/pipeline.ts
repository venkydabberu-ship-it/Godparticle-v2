import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { bundle }        from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { supabaseAdmin } from '../supabase';
import { generateVoice } from './elevenlabs';
import { wordsToASS, buildSubtitles } from '../video/subtitles';
import { mergeAudio, burnSubtitles, mixBackgroundMusic, getVideoDuration, getFileSize, cleanTmp } from './ffmpeg';
import type { AmContent } from '../supabase';
import type { SubtitleWord } from '../../remotion/components/SubtitleOverlay';

function scriptToNarration(script: string): string {
  return script
    .split('\n')
    .map(line => line.replace(/^\[[\d:]+\]\s*[-–—]?\s*/i, '').trim())
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function extractKeyPoints(script: string): string[] {
  const lines = script
    .split('\n')
    .map(l => l.replace(/^\[[\d:]+\]\s*[-–—]?\s*/i, '').trim())
    .filter(l => l.length > 20 && l.length < 120 && !l.startsWith('//'));
  return lines.filter((_, i) => i % 2 === 0).slice(0, 5);
}

async function setProgress(jobId: string, progress: number, step: string) {
  const db = supabaseAdmin();
  await db.from('am_video_jobs').update({ progress, current_step: step, updated_at: new Date().toISOString() }).eq('id', jobId);
}

async function setStatus(jobId: string, status: string, extra: Record<string, unknown> = {}) {
  const db = supabaseAdmin();
  await db.from('am_video_jobs').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', jobId);
}

async function uploadToStorage(filePath: string, bucket: string, storagePath: string): Promise<string> {
  const db = supabaseAdmin();
  const buffer = fs.readFileSync(filePath);
  const ext  = path.extname(filePath);
  const mime = ext === '.mp4' ? 'video/mp4' : ext === '.mp3' ? 'audio/mpeg' : ext === '.ass' ? 'text/plain' : 'application/octet-stream';
  const { error } = await db.storage.from(bucket).upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = db.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function runVideoPipeline(jobId: string, content: AmContent): Promise<void> {
  const db = supabaseAdmin();
  const tmpFiles: string[] = [];

  function tmp(ext: string) {
    const p = path.join(os.tmpdir(), `am_${jobId.slice(0, 8)}_${Date.now()}.${ext}`);
    tmpFiles.push(p); return p;
  }

  try {
    const { data: job } = await db.from('am_video_jobs').select('*').eq('id', jobId).single();
    if (!job) throw new Error('Job not found');

    const voiceId  = job.voice_id as string;
    const bgMusic  = job.bg_music  as string | null;
    const subStyle = (job.subtitle_style ?? 'bold') as 'bold' | 'minimal' | 'highlight';

    await setStatus(jobId, 'generating_voice');
    await setProgress(jobId, 5, 'Generating voiceover with ElevenLabs...');

    const script    = content.ai_script ?? content.ai_caption ?? content.idea_text;
    const narration = scriptToNarration(script);
    const keyPoints = extractKeyPoints(script);

    const voiceResult = await generateVoice(narration, voiceId);
    const audioTmp    = tmp('mp3');
    fs.writeFileSync(audioTmp, voiceResult.audioBuffer);

    const audioStorePath = `videos/${jobId}/voiceover.mp3`;
    const audioUrl = await uploadToStorage(audioTmp, 'automarket', audioStorePath);
    await db.from('am_video_jobs').update({ audio_url: audioUrl }).eq('id', jobId);
    await setProgress(jobId, 20, 'Voiceover done — rendering video...');

    await setStatus(jobId, 'rendering_video');

    const words: SubtitleWord[] = voiceResult.words;
    const totalDurationSec = voiceResult.durationSeconds;
    const fps = 30;
    const hookFrames    = Math.round(fps * Math.min(3, totalDurationSec * 0.12));
    const ctaFrames     = Math.round(fps * Math.min(3, totalDurationSec * 0.10));
    const contentFrames = Math.round(fps * totalDurationSec) - hookFrames - ctaFrames;
    const photoCount    = Math.max(content.image_urls?.length ?? 0, 1);
    const pointCount    = keyPoints.length;
    const totalSlides   = photoCount + pointCount;
    const framesPerSlide  = Math.max(fps * 2, Math.floor(contentFrames / Math.max(totalSlides, 1)));
    const framesPerPhoto  = framesPerSlide;
    const framesPerPoint  = Math.round(framesPerSlide * 0.85);

    const bundleLocation = await bundle(
      path.resolve('./src/remotion/index.ts'), () => undefined, { webpackOverride: c => c }
    );
    await setProgress(jobId, 35, 'Bundle done — rendering frames...');

    const composition = await selectComposition({
      serveUrl: bundleLocation, id: 'Reel',
      inputProps: {
        hook: content.ai_hook ?? content.idea_text,
        keyPoints, cta: content.ai_cta ?? 'Try it free at GodParticle.in',
        brandColor: '#7c3aed', brandName: 'GodParticle',
        imageUrls: content.image_urls ?? [], audioUrl,
        subtitleWords: words, subtitleStyle: subStyle,
        hookFrames, framesPerPhoto, framesPerPoint, ctaFrames,
      },
    });

    const rawVideoTmp = tmp('mp4');
    await renderMedia({
      composition, serveUrl: bundleLocation, codec: 'h264', outputLocation: rawVideoTmp,
      onProgress: ({ progress: p }) => setProgress(jobId, 35 + Math.round(p * 30), 'Rendering video frames...').catch(() => {}),
    });
    await setProgress(jobId, 65, 'Video rendered — merging audio...');

    const rawStorePath = `videos/${jobId}/raw.mp4`;
    const rawVideoUrl  = await uploadToStorage(rawVideoTmp, 'automarket', rawStorePath);
    await db.from('am_video_jobs').update({ raw_video_url: rawVideoUrl }).eq('id', jobId);

    await setStatus(jobId, 'merging_audio');
    const mergedTmp = tmp('mp4');
    await mergeAudio(rawVideoTmp, audioTmp, mergedTmp);
    await setProgress(jobId, 72, 'Audio merged — building subtitles...');

    await setStatus(jobId, 'generating_subtitles');
    const { srtContent } = await buildSubtitles(voiceResult.audioBuffer, words);
    const assContent     = wordsToASS(words, subStyle);
    const subsTmp = tmp('ass'); fs.writeFileSync(subsTmp, assContent);
    const srtTmp  = tmp('srt'); fs.writeFileSync(srtTmp,  srtContent);
    const subsStorePath = `videos/${jobId}/subtitles.srt`;
    const subtitlesUrl  = await uploadToStorage(srtTmp, 'automarket', subsStorePath);
    await db.from('am_video_jobs').update({ subtitles_url: subtitlesUrl }).eq('id', jobId);

    if (words.length > 0) {
      const rows = words.map((w, i) => ({ job_id: jobId, word_index: i, word: w.word, start_time: w.start, end_time: w.end }));
      await db.from('am_video_subtitles').insert(rows);
    }
    await setProgress(jobId, 80, 'Subtitles done — burning into video...');

    await setStatus(jobId, 'burning_subtitles');
    const burnedTmp = tmp('mp4');
    await burnSubtitles(mergedTmp, subsTmp, subStyle, burnedTmp);
    await setProgress(jobId, 88, 'Subtitles burned...');

    let finalTmp = burnedTmp;
    if (bgMusic && bgMusic !== 'none') {
      const musicMap: Record<string, string> = {
        subtle: './public/music/subtle.mp3', upbeat: './public/music/upbeat.mp3', dramatic: './public/music/dramatic.mp3',
      };
      const musicPath = musicMap[bgMusic];
      if (musicPath && fs.existsSync(musicPath)) {
        const mixedTmp = tmp('mp4');
        await mixBackgroundMusic(burnedTmp, musicPath, 0.08, mixedTmp);
        finalTmp = mixedTmp;
      }
    }
    await setProgress(jobId, 93, 'Uploading final video...');

    await setStatus(jobId, 'uploading');
    const finalStorePath = `videos/${jobId}/final.mp4`;
    const finalVideoUrl  = await uploadToStorage(finalTmp, 'automarket', finalStorePath);
    const duration  = await getVideoDuration(finalTmp);
    const fileSize  = getFileSize(finalTmp);

    await setStatus(jobId, 'done', {
      final_video_url: finalVideoUrl, duration_seconds: duration,
      file_size_bytes: fileSize, progress: 100, current_step: 'Done!',
      completed_at: new Date().toISOString(),
    });
    await db.from('am_content').update({ video_url: finalVideoUrl }).eq('id', content.id);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setStatus(jobId, 'failed', { error_msg: msg, current_step: `Failed: ${msg.slice(0, 200)}` });
    throw err;
  } finally {
    cleanTmp(...tmpFiles);
  }
}
