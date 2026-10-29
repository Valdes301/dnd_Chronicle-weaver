/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  compress: true,
  poweredByHeader: false,
  reactStrictMode: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
      allowedOrigins: [
        '*.run.app',
        '*.aistudio.google.com',
        '*.google.com',
        '*.googleusercontent.com',
        'localhost:3000',
        '127.0.0.1:3000',
      ],
    },
  },
  allowedDevOrigins: [
    '*.run.app',
    '*.aistudio.google.com',
    '*.google.com',
    '*.googleusercontent.com',
    'localhost:3000',
    '127.0.0.1:3000',
  ],
  serverExternalPackages: ['better-sqlite3', 'pdf-parse'],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
