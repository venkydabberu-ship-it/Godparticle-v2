import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';

ffmpeg.setFfmpegPath(ffmpegPath.path);

function tmpFile(ext: string): string {
  return path.join(os.tmpdir(), `am_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

function run(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => { cmd.on('end', resolve).on('error', reject).run(); });
}

export async function mergeAudio(videoPath: string, audioPath: string, outputPath?: string): Promise<string> {
  const out = outputPath ?? tmpFile('mp4');
  await run(
    ffmpeg().input(videoPath).input(audioPath)
      .outputOptions(['-c:v copy', '-c:a aac', '-b:a 192k', '-shortest', '-movflags +faststart'])
      .output(out)
  );
  return out;
}

export async function burnSubtitles(
  videoPath: string, subsPath: string,
  style: 'bold' | 'minimal' | 'highlight' = 'bold', outputPath?: string
): Promise<string> {
  const out = outputPath ?? tmpFile('mp4');
  const ext = path.extname(subsPath).toLowerCase();
  const fontStyles: Record<string, string> = {
    bold:      'FontName=Arial,Bold=1,FontSize=68,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=4,Shadow=2,Alignment=2,MarginV=100',
    minimal:   'FontName=Arial,Bold=0,FontSize=52,PrimaryColour=&H00F1F5F9,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=90',
    highlight: 'FontName=Arial,Bold=1,FontSize=72,PrimaryColour=&H00F0C040,OutlineColour=&H007C3AED,Outline=5,Shadow=3,Alignment=2,MarginV=110',
  };
  const escapedSubs = subsPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const filterStr = ext === '.ass'
    ? `ass='${escapedSubs}'`
    : `subtitles='${escapedSubs}':force_style='${fontStyles[style]}'`;
  await run(
    ffmpeg().input(videoPath).videoFilter(filterStr)
      .outputOptions(['-c:a copy', '-movflags +faststart']).output(out)
  );
  return out;
}

export async function mixBackgroundMusic(
  videoPath: string, musicPath: string, musicVol = 0.08, outputPath?: string
): Promise<string> {
  const out = outputPath ?? tmpFile('mp4');
  await run(
    ffmpeg().input(videoPath).input(musicPath)
      .complexFilter([
        `[1:a]volume=${musicVol}[music]`,
        `[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      ])
      .outputOptions(['-c:v copy', '-map 0:v', '-map [aout]', '-c:a aac', '-b:a 192k', '-movflags +faststart'])
      .output(out)
  );
  return out;
}

export async function scaleVideo(inputPath: string, width = 1080, height = 1920, outputPath?: string): Promise<string> {
  const out = outputPath ?? tmpFile('mp4');
  await run(
    ffmpeg().input(inputPath)
      .videoFilter(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`)
      .outputOptions(['-c:a copy', '-movflags +faststart']).output(out)
  );
  return out;
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (err) return reject(err);
      resolve(meta.format.duration ?? 0);
    });
  });
}

export function getFileSize(filePath: string): number { return fs.statSync(filePath).size; }
export function cleanTmp(...paths: string[]) {
  for (const p of paths) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
}
