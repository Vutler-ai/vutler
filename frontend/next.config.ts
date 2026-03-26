import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',

  // Disable telemetry
  productionBrowserSourceMaps: false,

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Proxy API and WebSocket requests to the Express backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_URL
          ? `${process.env.API_URL}/api/:path*`
          : 'http://localhost:3001/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: process.env.WS_URL
          ? `${process.env.WS_URL}/ws/:path*`
          : 'http://localhost:3001/ws/:path*',
      },
    ];
  },
};

export default nextConfig;
