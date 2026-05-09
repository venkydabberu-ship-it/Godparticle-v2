import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props {
  imageUrl: string; overlayText?: string;
  overlayPosition?: 'top' | 'bottom' | 'center';
  kenBurnsDir?: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  totalFrames: number; brandColor?: string;
}

export function PhotoSlide({
  imageUrl, overlayText, overlayPosition = 'bottom',
  kenBurnsDir = 'zoom-in', totalFrames, brandColor = '#7c3aed',
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = frame / totalFrames;

  const kbScale = kenBurnsDir === 'zoom-in'  ? interpolate(progress, [0,1],[1.0,1.12])
                : kenBurnsDir === 'zoom-out' ? interpolate(progress, [0,1],[1.12,1.0]) : 1.06;
  const kbX = kenBurnsDir === 'pan-left'  ? interpolate(progress, [0,1],[0,-40])
             : kenBurnsDir === 'pan-right' ? interpolate(progress, [0,1],[0,40]) : 0;
  const opacity = interpolate(frame, [0,12],[0,1]);
  const textProgress = spring({ fps, frame: frame - 20, config: { damping: 14, stiffness: 120 } });
  const textY = interpolate(textProgress, [0,1],[50,0]);
  const textOpacity = interpolate(textProgress, [0,1],[0,1]);
  const overlayY = overlayPosition === 'top' ? '8%' : overlayPosition === 'center' ? '40%' : 'auto';
  const overlayBottom = overlayPosition === 'bottom' ? '160px' : 'auto';

  return (
    <AbsoluteFill style={{ opacity, background: '#000' }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img src={imageUrl} style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: `scale(${kbScale}) translateX(${kbX}px)`,
          transformOrigin: 'center center',
        }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 30%, transparent 50%, rgba(0,0,0,0.7) 85%, rgba(0,0,0,0.9) 100%)' }} />
      {overlayText && (
        <div style={{ position: 'absolute', top: overlayY, bottom: overlayBottom, left: 60, right: 60, transform: `translateY(${textY}px)`, opacity: textOpacity }}>
          <p style={{ fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: overlayText.length < 60 ? 64 : 48, color: '#f1f5f9', lineHeight: 1.2, margin: 0, textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
            {overlayText}
          </p>
          <div style={{ height: 6, width: 80, marginTop: 16, background: `linear-gradient(90deg, ${brandColor}, #f059da)`, borderRadius: 3 }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: interpolate(frame,[0,8],[1920,0]), background: '#09090f' }} />
    </AbsoluteFill>
  );
}
