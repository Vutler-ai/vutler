import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Disable telemetry
  productionBrowserSourceMaps: false,

  // Optimize images — allow static avatar proxy
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3001', pathname: '/static/**' },
      { protocol: 'http', hostname: 'localhost', port: '3099', pathname: '/static/**' },
      { protocol: 'https', hostname: 'app.vutler.ai', pathname: '/static/**' },
    ],
    unoptimized: process.env.NODE_ENV !== 'production',
  },

  // Proxy API, WebSocket, and static asset requests to the Express backend
  async rewrites() {
    const backendBase = process.env.API_URL ?? 'http://localhost:3001';
    const wsBase = process.env.WS_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendBase}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${wsBase}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
