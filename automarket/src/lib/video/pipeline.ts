import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { supabaseAdmin } from '../supabase';
import { generateVoice, groupWordsToSubtitles } from './elevenlabs';
import type { AmContent } from '../supabase';

ffmpeg.setFfmpegPath(ffmpegPath.path);

function wrapText(text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxW) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function extractNarration(script: string): string {
  return script.split('\n')
    .map(l => l.replace(/^\[[\d:]+\]\s*[-–—]?\s*/i,'').trim())
    .filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}

function extractKeyPoints(script: string): string[] {
  return script.split('\n')
    .map(l => l.replace(/^\[[\d:]+\]\s*[-–—]?\s*/i,'').trim())
    .filter(l => l.length > 15 && l.length < 110)
    .slice(0, 5);
}

async function makeSlide(headline: string, style: 'hook'|'point'|'cta', outPath: string): Promise<void> {
  const maxW = style === 'hook' ? 18 : 26;
  const lines = wrapText(headline, maxW);
  const fsPx = style === 'hook' ? 90 : 72;
  const lineH = style === 'hook' ? 110 : 88;
  const color = style === 'cta' ? '#FAD7A0' : style === 'hook' ? '#FFFFFF' : '#E8DDFF';
  const totalH = lines.length * lineH;
  const startY = 960 - totalH / 2 + lineH;
  const textSvg = lines.map((l, i) =>
    `<text x="540" y="${startY + i * lineH}" text-anchor="middle" fill="${color}" font-size="${fsPx}" font-weight="bold" font-family="Georgia, serif">${esc(l)}</text>`
  ).join('');
  const svg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="#0d0d14"/>
        <stop offset="100%" stop-color="#1a0930"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#g)"/>
    <rect width="1080" height="6" fill="#7c3aed"/>
    <rect y="1914" width="1080" height="6" fill="#7c3aed"/>
    <text x="540" y="120" text-anchor="middle" fill="#7c3aed" font-size="40" font-weight="bold" font-family="Georgia, serif">⚡ GodParticle.in</text>
    ${textSvg}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

function runCmd(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd.on('end', () => resolve()).on('error', reject).run();
  });
}

async function setStatus(jobId: string, status: string, extra: Record<string,unknown> = {}) {
  await supabaseAdmin().from('am_video_jobs').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', jobId);
}

async function setProgress(jobId: string, progress: number, step: string) {
  await supabaseAdmin().from('am_video_jobs').update({ progress, current_step: step, updated_at: new Date().toISOString() }).eq('id', jobId);
}

async function uploadBuf(buf: Buffer, storagePath: string, mime: string): Promise<string> {
  const db = supabaseAdmin();
  const { error } = await db.storage.from('automarket').upload(storagePath, buf, { contentType: mime, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return db.storage.from('automarket').getPublicUrl(storagePath).data.publicUrl;
}

export async function runVideoPipeline(jobId: string, content: AmContent): Promise<void> {
  const dir = os.tmpdir();
  const pre = `am_${jobId.slice(0,8)}`;
  const tmpFiles: string[] = [];
  const tmp = (n: string) => { const f = path.join(dir, `${pre}_${n}`); tmpFiles.push(f); return f; };

  try {
    const { data: job } = await supabaseAdmin().from('am_video_jobs').select('*').eq('id', jobId).single();
    if (!job) throw new Error('Job not found');

    await setStatus(jobId, 'generating_voice');
    await setProgress(jobId, 5, 'Preparing content...');

    const script = content.ai_script ?? content.ai_caption ?? content.idea_text;
    const narration = extractNarration(script);
    const keyPoints = extractKeyPoints(script);
    const hook = content.ai_hook ?? content.idea_text.slice(0, 70);
    const cta = content.ai_cta ?? 'Follow for more. Visit GodParticle.in';

    let audioPath: string | null = null;
    let durationSec = 40;
    let srtContent = '';

    if (process.env.ELEVENLABS_API_KEY) {
      await setProgress(jobId, 10, 'Generating voiceover...');
      const voice = await generateVoice(narration, job.voice_id as string);
      audioPath = tmp('voice.mp3');
      fs.writeFileSync(audioPath, voice.audioBuffer);
      durationSec = Math.max(Math.ceil(voice.durationSeconds) + 2, 20);
      const chunks = groupWordsToSubtitles(voice.words, 4);
      const fmt = (s: number) => {
        const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
      };
      srtContent = chunks.map((c, i) => `${i+1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n');
      const audioUrl = await uploadBuf(voice.audioBuffer, `videos/${jobId}/voice.mp3`, 'audio/mpeg');
      await supabaseAdmin().from('am_video_jobs').update({ audio_url: audioUrl }).eq('id', jobId);
    }

    await setProgress(jobId, 35, 'Creating slides...');
    await setStatus(jobId, 'rendering_video');

    const hookSlide = tmp('hook.png');
    await makeSlide(hook, 'hook', hookSlide);
    const pointSlides: string[] = [];
    for (let i = 0; i < keyPoints.length; i++) {
      const sp = tmp(`pt${i}.png`);
      await makeSlide(keyPoints[i], 'point', sp);
      pointSlides.push(sp);
    }
    const ctaSlide = tmp('cta.png');
    await makeSlide(cta, 'cta', ctaSlide);

    await setProgress(jobId, 55, 'Encoding video...');

    const hookDur = 4;
    const ctaDur = 4;
    const ptTotal = Math.max(durationSec - hookDur - ctaDur, keyPoints.length * 5);
    const ptDur = keyPoints.length > 0 ? Math.round(ptTotal / keyPoints.length) : 8;
    const slides = [
      { path: hookSlide, dur: hookDur },
      ...pointSlides.map(p => ({ path: p, dur: ptDur })),
      { path: ctaSlide, dur: ctaDur },
    ];

    let srtPath: string | null = null;
    if (srtContent) { srtPath = tmp('subs.srt'); fs.writeFileSync(srtPath, srtContent); }

    const videoPath = tmp('reel.mp4');
    const n = slides.length;

    const cmd = ffmpeg();
    slides.forEach(s => cmd.input(s.path).inputOptions(['-loop','1','-framerate','30','-t',String(s.dur)]));
    if (audioPath) cmd.input(audioPath);

    const scaleConcat = slides.map((_,i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=disable,setsar=1[v${i}]`).join(';');
    const catIn = slides.map((_,i) => `[v${i}]`).join('');
    let fc = `${scaleConcat};${catIn}concat=n=${n}:v=1:a=0[cv]`;

    if (srtPath) {
      const safe = srtPath.replace(/\\/g,'/').replace(/:/g,'\\\\:');
      fc += `;[cv]subtitles='${safe}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Bold=1,Alignment=2,MarginV=80'[outv]`;
    } else {
      fc += ';[cv]null[outv]';
    }

    const outOpts = [
      '-map [outv]',
      ...(audioPath ? [`-map ${n}:a`] : []),
      '-c:v libx264',
      '-preset ultrafast',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      ...(audioPath ? ['-c:a aac','-shortest','-ar 44100'] : [`-t ${durationSec}`]),
    ];

    cmd.complexFilter(fc).outputOptions(outOpts).save(videoPath);
    await runCmd(cmd);

    await setProgress(jobId, 88, 'Uploading reel...');
    await setStatus(jobId, 'uploading');

    const videoBuf = fs.readFileSync(videoPath);
    const finalUrl = await uploadBuf(videoBuf, `videos/${jobId}/reel.mp4`, 'video/mp4');
    const fileSize = fs.statSync(videoPath).size;

    await setStatus(jobId, 'done', {
      final_video_url: finalUrl,
      duration_seconds: durationSec,
      file_size_bytes: fileSize,
      progress: 100,
      current_step: 'Your reel is ready! 🎉',
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin().from('am_content').update({ video_url: finalUrl }).eq('id', content.id);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setStatus(jobId, 'failed', { error_msg: msg, current_step: `Failed: ${msg.slice(0,200)}` });
    throw err;
  } finally {
    tmpFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
  }
}
