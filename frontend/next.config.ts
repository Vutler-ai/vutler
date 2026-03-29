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

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
