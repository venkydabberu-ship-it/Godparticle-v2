/** @type {import('next').NextConfig} */
const config = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
      'sharp',
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
    ],
  },
};

export default config;
