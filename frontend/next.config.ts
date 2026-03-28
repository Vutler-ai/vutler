import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Disable telemetry
  productionBrowserSourceMaps: false,

  // Optimize images — allow static avatar proxy
  images: {
    unoptimized: true, // Avatars served directly by nginx — no Next.js optimization needed
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
      {
        source: '/static/:path*',
        destination: `${backendBase}/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
