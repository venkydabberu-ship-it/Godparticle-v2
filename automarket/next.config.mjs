/** @type {import('next').NextConfig} */
const config = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'cdninstagram.com' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
    serverComponentsExternalPackages: [
      '@remotion/bundler',
      '@remotion/renderer',
      '@remotion/media-utils',
      '@remotion/studio',
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
      'esbuild',
    ],
  },
};

export default config;
