// Subtitle generation — primary: ElevenLabs alignment, fallback: OpenAI Whisper

import OpenAI from 'openai';
import { wordsToSRT } from './elevenlabs';
import type { WordTimestamp } from './elevenlabs';

export async function transcribeAudio(audioBuffer: Buffer): Promise<WordTimestamp[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const file = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });
  const transcription = await openai.audio.transcriptions.create({
    file, model: 'whisper-1', response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });
  const words = (transcription as unknown as { words?: { word: string; start: number; end: number }[] }).words ?? [];
  return words.map(w => ({ word: w.word.trim().replace(/[.,!?;:]/g, ''), start: w.start, end: w.end }));
}

export async function buildSubtitles(
  audioBuffer: Buffer, existingWords?: WordTimestamp[]
): Promise<{ srtContent: string; words: WordTimestamp[] }> {
  let words = existingWords;
  if (!words || words.length === 0) {
    try { words = await transcribeAudio(audioBuffer); }
    catch (e) { console.error('Whisper transcription failed:', e); words = []; }
  }
  const srtContent = wordsToSRT(words, 3);
  return { srtContent, words };
}

export function parseSRT(srt: string): { index: number; start: number; end: number; text: string }[] {
  const blocks = srt.trim().split(/\n\n+/);
  return blocks.map(block => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return null;
    const index = parseInt(lines[0]);
    const [s, e] = lines[1].split(' --> ');
    const text  = lines.slice(2).join(' ');
    return { index, start: srtTimeToSeconds(s), end: srtTimeToSeconds(e), text };
  }).filter(Boolean) as { index: number; start: number; end: number; text: string }[];
}

function srtTimeToSeconds(t: string): number {
  const [hms, ms] = t.trim().replace(',', '.').split('.');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + (ms ? parseFloat(`0.${ms}`) : 0);
}

export function wordsToASS(words: WordTimestamp[], style: 'bold' | 'minimal' | 'highlight' = 'bold'): string {
  const styles: Record<string, string> = {
    bold:      'Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,40,1',
    minimal:   'Style: Default,Arial,42,&H00F1F5F9,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,40,1',
    highlight: 'Style: Default,Arial,56,&H00F0C040,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,10,10,40,1',
  };

  const chunks = groupToChunks(words, 3);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles[style]}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = chunks.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text}`).join('\n');
  return `${header}\n${events}`;
}

function groupToChunks(words: WordTimestamp[], n: number) {
  const out: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += n) {
    const slice = words.slice(i, i + n);
    out.push({ text: slice.map(w => w.word).join(' '), start: slice[0].start, end: slice[slice.length - 1].end });
  }
  return out;
}

function assTime(s: number): string {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = (s % 60).toFixed(2);
  return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(5,'0')}`;
}
