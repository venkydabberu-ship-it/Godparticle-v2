import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import { HookSlide }       from './slides/HookSlide';
import { PhotoSlide }      from './slides/PhotoSlide';
import { TextSlide }       from './slides/TextSlide';
import { CTASlide }        from './slides/CTASlide';
import { SubtitleOverlay } from './components/SubtitleOverlay';
import type { SubtitleWord } from './components/SubtitleOverlay';

const KB_DIRS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'] as const;

export interface ReelProps {
  hook: string; keyPoints: string[]; cta: string;
  brandColor?: string; brandName?: string; logoUrl?: string;
  imageUrls: string[]; audioUrl?: string; bgMusicUrl?: string;
  subtitleWords: SubtitleWord[]; subtitleStyle?: 'bold' | 'minimal' | 'highlight';
  hookFrames: number; framesPerPhoto: number; framesPerPoint: number; ctaFrames: number;
}

const DEF: Partial<ReelProps> = { brandColor: '#7c3aed', brandName: 'GodParticle', subtitleStyle: 'bold', hookFrames: 90, framesPerPhoto: 90, framesPerPoint: 75, ctaFrames: 90 };

export function ReelComposition(raw: ReelProps) {
  const p = { ...DEF, ...raw } as Required<ReelProps>;
  const segments: { from: number; durationInFrames: number; el: React.ReactNode }[] = [];
  let cursor = 0;

  segments.push({ from: cursor, durationInFrames: p.hookFrames, el: <HookSlide hook={p.hook} brandColor={p.brandColor} /> });
  cursor += p.hookFrames;

  const images = p.imageUrls.length > 0 ? p.imageUrls : [];
  const points = p.keyPoints.length > 0 ? p.keyPoints : [];
  const photoCount = Math.max(images.length, 1);
  const pointCount = points.length;
  const totalContentSlides = photoCount + pointCount;

  for (let i = 0; i < totalContentSlides; i++) {
    const isPoint = points.length > 0 && i % 2 === 1 && Math.floor(i / 2) < pointCount;
    if (isPoint) {
      const ptIdx = Math.floor(i / 2);
      segments.push({ from: cursor, durationInFrames: p.framesPerPoint, el: <TextSlide heading={points[ptIdx]} index={ptIdx + 1} brandColor={p.brandColor} totalFrames={p.framesPerPoint} /> });
      cursor += p.framesPerPoint;
    } else {
      const imgIdx = Math.floor(i / 2) % images.length;
      if (images.length > 0) {
        segments.push({ from: cursor, durationInFrames: p.framesPerPhoto, el: <PhotoSlide imageUrl={images[imgIdx]} overlayText={points[imgIdx] ?? undefined} kenBurnsDir={KB_DIRS[imgIdx % 4]} totalFrames={p.framesPerPhoto} brandColor={p.brandColor} /> });
        cursor += p.framesPerPhoto;
      }
    }
  }

  segments.push({ from: cursor, durationInFrames: p.ctaFrames, el: <CTASlide cta={p.cta} brandName={p.brandName} brandColor={p.brandColor} /> });

  return (
    <AbsoluteFill style={{ background: '#09090f', fontFamily: 'Arial, sans-serif' }}>
      {segments.map((seg, i) => <Sequence key={i} from={seg.from} durationInFrames={seg.durationInFrames}>{seg.el as React.ReactElement}</Sequence>)}
      {p.audioUrl && <Audio src={p.audioUrl} />}
      {p.bgMusicUrl && <Audio src={p.bgMusicUrl} volume={0.08} />}
      {p.subtitleWords.length > 0 && <SubtitleOverlay words={p.subtitleWords} style={p.subtitleStyle} wordsPerChunk={3} />}
    </AbsoluteFill>
  );
}
