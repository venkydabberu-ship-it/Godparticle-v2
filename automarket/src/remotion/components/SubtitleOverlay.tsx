import { useCurrentFrame, useVideoConfig } from 'remotion';

export interface SubtitleWord { word: string; start: number; end: number; }

interface Props { words: SubtitleWord[]; style?: 'bold' | 'minimal' | 'highlight'; wordsPerChunk?: number; }
interface Chunk { words: SubtitleWord[]; start: number; end: number; }

export function SubtitleOverlay({ words, style = 'bold', wordsPerChunk = 3 }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  if (!words.length) return null;
  const chunks: Chunk[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const slice = words.slice(i, i + wordsPerChunk);
    chunks.push({ words: slice, start: slice[0].start, end: slice[slice.length - 1].end });
  }
  const activeChunk = chunks.find(c => currentTime >= c.start && currentTime <= c.end + 0.1);
  if (!activeChunk) return null;
  const styles = {
    bold: {
      wrapper: { position: 'absolute' as const, bottom: 180, left: 60, right: 60, display: 'flex', justifyContent: 'center', flexWrap: 'wrap' as const, gap: 12 },
      word: (active: boolean) => ({ fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: 68, color: active ? '#f0c040' : '#ffffff', textShadow: '0 4px 20px rgba(0,0,0,0.9)', display: 'inline-block' as const, lineHeight: 1.15 }),
    },
    minimal: {
      wrapper: { position: 'absolute' as const, bottom: 160, left: 80, right: 80, display: 'flex', justifyContent: 'center', flexWrap: 'wrap' as const, gap: 10 },
      word: (_active: boolean) => ({ fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 52, color: '#f1f5f9', textShadow: '0 2px 8px rgba(0,0,0,0.8)', display: 'inline-block' as const, lineHeight: 1.2 }),
    },
    highlight: {
      wrapper: { position: 'absolute' as const, bottom: 200, left: 60, right: 60, display: 'flex', justifyContent: 'center', flexWrap: 'wrap' as const, gap: 14 },
      word: (active: boolean) => ({ fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: 72, color: '#ffffff', background: active ? 'linear-gradient(135deg, #7c3aed, #f059da)' : 'transparent', padding: active ? '4px 16px' : '4px 0', borderRadius: active ? 12 : 0, textShadow: active ? 'none' : '0 3px 12px rgba(0,0,0,0.9)', display: 'inline-block' as const, lineHeight: 1.2 }),
    },
  };
  const s = styles[style];
  return (
    <div style={s.wrapper}>
      {activeChunk.words.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        return <span key={i} style={s.word(isActive)}>{w.word}</span>;
      })}
    </div>
  );
}
