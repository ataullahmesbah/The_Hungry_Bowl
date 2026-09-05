/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    // Keep server actions body small; media goes direct to Cloudinary.
    serverActions: { bodySizeLimit: '2mb' },
  },
  // Portable across Vercel and self-hosted VPS/Docker.
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
