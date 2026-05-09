const BASE = 'https://api.elevenlabs.io/v1';
const KEY  = () => process.env.ELEVENLABS_API_KEY!;

export interface WordTimestamp { word: string; start: number; end: number; }

export interface VoiceResult { audioBuffer: Buffer; words: WordTimestamp[]; durationSeconds: number; }

export const VOICES = {
  adam:    { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam',    lang: 'en-US', gender: 'male'   },
  rachel:  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel',  lang: 'en-US', gender: 'female' },
  rishi:   { id: 'gieo6kfnl9oBGiaBnreN', label: 'Rishi',   lang: 'en-IN', gender: 'male'   },
  priya:   { id: 'ThT5KcBeYPX3keUQqHPh', label: 'Priya',   lang: 'en-IN', gender: 'female' },
  charlie: { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie', lang: 'en-GB', gender: 'male'   },
} as const;

export type VoiceId = keyof typeof VOICES;

export async function generateVoice(text: string, voiceId: string = VOICES.adam.id, stability = 0.5, similarityBoost = 0.75): Promise<VoiceResult> {
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability, similarity_boost: similarityBoost, style: 0.3, use_speaker_boost: true } }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`ElevenLabs error ${res.status}: ${err}`); }
  const json = await res.json() as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]; };
    normalized_alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]; };
  };
  const audioBuffer = Buffer.from(json.audio_base64, 'base64');
  const words = alignmentToWords(json.normalized_alignment ?? json.alignment);
  const durationSeconds = words.length > 0 ? words[words.length - 1].end : 0;
  return { audioBuffer, words, durationSeconds };
}

function alignmentToWords(alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]; }): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  let current = '';
  let wordStart = 0;
  for (let i = 0; i < alignment.characters.length; i++) {
    const ch = alignment.characters[i];
    const start = alignment.character_start_times_seconds[i];
    const end   = alignment.character_end_times_seconds[i];
    if (ch === ' ' || ch === '\n') {
      if (current.trim()) { words.push({ word: current.trim(), start: wordStart, end }); current = ''; }
    } else {
      if (!current) wordStart = start;
      current += ch;
    }
  }
  if (current.trim() && alignment.character_end_times_seconds.length > 0) {
    words.push({ word: current.trim(), start: wordStart, end: alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1] });
  }
  return words;
}

export function groupWordsToSubtitles(words: WordTimestamp[], wordsPerChunk = 3): { text: string; start: number; end: number }[] {
  const chunks: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk);
    chunks.push({ text: slice.map(w => w.word).join(' '), start: slice[0].start, end: slice[slice.length - 1].end });
  }
  return chunks;
}

export function wordsToSRT(words: WordTimestamp[], wordsPerChunk = 3): string {
  const chunks = groupWordsToSubtitles(words, wordsPerChunk);
  return chunks.map((c, i) => {
    const start = secondsToSRTTime(c.start);
    const end   = secondsToSRTTime(c.end);
    return `${i + 1}\n${start} --> ${end}\n${c.text}\n`;
  }).join('\n');
}

function secondsToSRTTime(s: number): string {
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(ss)},${pad(ms, 3)}`;
}

function pad(n: number, len = 2) { return String(n).padStart(len, '0'); }
