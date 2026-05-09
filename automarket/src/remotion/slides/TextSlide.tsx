import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props { heading: string; subtext?: string; emoji?: string; index?: number; brandColor?: string; totalFrames: number; }

export function TextSlide({ heading, subtext, emoji, index = 0, brandColor = '#7c3aed', totalFrames }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ fps, frame: frame - 5, config: { damping: 14, stiffness: 130 } });
  const y = interpolate(progress, [0, 1], [60, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const exitOpacity = interpolate(frame, [totalFrames - 12, totalFrames], [1, 0]);
  const numberProgress = spring({ fps, frame: frame - 2, config: { damping: 10, stiffness: 200 } });
  const numberScale = interpolate(numberProgress, [0, 1], [0.4, 1]);
  return (
    <AbsoluteFill style={{ background: '#09090f', justifyContent: 'center', alignItems: 'flex-start', padding: '0 72px', opacity: exitOpacity }}>
      <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 6, background: `linear-gradient(180deg, transparent, ${brandColor}, #f059da, transparent)`, opacity: interpolate(progress, [0, 1], [0, 1]) }} />
      <div style={{ transform: `translateY(${y}px)`, opacity }}>
        {(index > 0 || emoji) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32, transform: `scale(${numberScale})`, transformOrigin: 'left center' }}>
            {emoji ? <span style={{ fontSize: 90 }}>{emoji}</span> : (
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${brandColor}, #f059da)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial Black', fontWeight: 900, fontSize: 44, color: '#fff' }}>{index}</div>
            )}
          </div>
        )}
        <h2 style={{ fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: heading.length < 40 ? 80 : heading.length < 70 ? 64 : 52, color: '#f1f5f9', lineHeight: 1.15, margin: '0 0 32px 0', letterSpacing: '-1px' }}>{heading}</h2>
        {subtext && <p style={{ fontFamily: 'Arial, sans-serif', fontSize: 40, color: '#94a3b8', lineHeight: 1.5, margin: 0, maxWidth: 900 }}>{subtext}</p>}
        <div style={{ height: 6, marginTop: 40, width: interpolate(progress, [0, 1], [0, 120]), background: `linear-gradient(90deg, ${brandColor}, #f059da)`, borderRadius: 3 }} />
      </div>
    </AbsoluteFill>
  );
}
