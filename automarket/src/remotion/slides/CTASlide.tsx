import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props { cta: string; url?: string; brandName?: string; brandColor?: string; }

export function CTASlide({ cta, url = 'GodParticle.in', brandName = 'GodParticle', brandColor = '#7c3aed' }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bgProgress   = spring({ fps, frame,          config: { damping: 20, stiffness: 80  } });
  const logoProgress = spring({ fps, frame: frame-8,  config: { damping: 14, stiffness: 140 } });
  const ctaProgress  = spring({ fps, frame: frame-16, config: { damping: 14, stiffness: 130 } });
  const urlProgress  = spring({ fps, frame: frame-24, config: { damping: 14, stiffness: 130 } });
  const logoScale = interpolate(logoProgress, [0,1],[0.6,1]);
  const ctaY      = interpolate(ctaProgress,  [0,1],[50,0]);
  const urlY      = interpolate(urlProgress,  [0,1],[40,0]);
  const opacity   = interpolate(bgProgress,   [0,1],[0,1]);
  const pulse = Math.sin(frame * 0.15) * 0.04 + 1;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, #09090f 0%, ${brandColor}22 50%, #09090f 100%)`, justifyContent: 'center', alignItems: 'center', opacity }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(${brandColor}15 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, ${brandColor}25 0%, transparent 70%)`, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40, padding: '0 60px', textAlign: 'center', position: 'relative' }}>
        <div style={{ width: 120, height: 120, borderRadius: 32, background: `linear-gradient(135deg, ${brandColor}, #f059da)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, transform: `scale(${logoScale})`, boxShadow: `0 20px 60px ${brandColor}44` }}>⚛</div>
        <div style={{ fontFamily: 'Arial Black, Arial', fontWeight: 900, fontSize: 56, background: `linear-gradient(135deg, ${brandColor}, #f059da)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', transform: `scale(${logoScale})`, letterSpacing: '-1px' }}>{brandName}</div>
        <p style={{ fontFamily: 'Arial Black, Arial', fontWeight: 900, fontSize: cta.length < 60 ? 64 : 50, color: '#f1f5f9', lineHeight: 1.2, margin: 0, transform: `translateY(${ctaY}px)`, opacity: interpolate(ctaProgress,[0,1],[0,1]), maxWidth: 900 }}>{cta}</p>
        <div style={{ background: `linear-gradient(135deg, ${brandColor}, #f059da)`, padding: '20px 60px', borderRadius: 100, fontFamily: 'Arial Black, Arial', fontWeight: 900, fontSize: 48, color: '#fff', letterSpacing: 1, transform: `translateY(${urlY}px) scale(${pulse})`, opacity: interpolate(urlProgress,[0,1],[0,1]), boxShadow: `0 20px 50px ${brandColor}55` }}>{url}</div>
        <div style={{ fontSize: 48, opacity: 0.5, transform: `translateY(${Math.sin(frame * 0.12) * 8}px)` }}>☝️</div>
      </div>
    </AbsoluteFill>
  );
}
