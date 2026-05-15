import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export function HookSlide({ hook, brandColor = '#7c3aed' }: { hook: string; brandColor?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = hook.split(' ');
  return (
    <AbsoluteFill style={{ background: '#09090f', justifyContent: 'center', alignItems: 'center', padding: 60 }}>
      <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: `radial-gradient(circle, ${brandColor}33 0%, transparent 70%)`, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: interpolate(frame, [0, 30], [0, 1]) }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, padding: '0 40px', textAlign: 'center' }}>
        {words.map((word, i) => {
          const delay = i * 6;
          const progress = spring({ fps, frame: frame - delay, config: { damping: 12, stiffness: 200 } });
          const y = interpolate(progress, [0, 1], [40, 0]);
          const opacity = interpolate(progress, [0, 1], [0, 1]);
          const isAccent = i % 4 === 2;
          return (
            <span key={i} style={{ fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: 900, fontSize: hook.length < 40 ? 100 : hook.length < 80 ? 76 : 60, lineHeight: 1.1, color: isAccent ? brandColor : '#f1f5f9', transform: `translateY(${y}px)`, opacity, display: 'inline-block', letterSpacing: '-1px', textShadow: isAccent ? `0 0 40px ${brandColor}88` : 'none' }}>
              {word}
            </span>
          );
        })}
      </div>
      {frame > fps * 2 && (
        <div style={{ position: 'absolute', bottom: 120, opacity: interpolate(frame, [fps * 2, fps * 2.5], [0, 0.6]), color: '#64748b', fontFamily: 'Arial', fontSize: 28, letterSpacing: 4 }}>▼ ▼ ▼</div>
      )}
    </AbsoluteFill>
  );
}
