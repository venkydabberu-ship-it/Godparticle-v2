import { Composition } from 'remotion';
import { ReelComposition } from './Reel';
import type { ReelProps }  from './Reel';

const defaultProps: ReelProps = {
  hook:         'The Number Institutions NEVER Want You to Know 👀',
  keyPoints:    [
    'Institutions write options around a hidden cost basis',
    'That cost basis is the God Particle',
    'Trade WITH the gravity, not against it',
  ],
  cta:           'Get the God Particle free at GodParticle.in',
  brandColor:    '#7c3aed',
  brandName:     'GodParticle',
  imageUrls:     [],
  audioUrl:      undefined,
  bgMusicUrl:    undefined,
  subtitleWords: [],
  subtitleStyle: 'bold',
  hookFrames:    90,
  framesPerPhoto: 90,
  framesPerPoint: 75,
  ctaFrames:     90,
};

function totalFrames(p: ReelProps): number {
  const photos = p.imageUrls.length || 1;
  const points = p.keyPoints.length;
  return (
    (p.hookFrames    ?? 90) +
    photos * (p.framesPerPhoto ?? 90) +
    points * (p.framesPerPoint ?? 75) +
    (p.ctaFrames     ?? 90)
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="Reel"
      component={ReelComposition}
      durationInFrames={totalFrames(defaultProps)}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: totalFrames(props),
      })}
    />
  );
}
