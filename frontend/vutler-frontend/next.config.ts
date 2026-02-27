import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for deployment via Express
  output: 'export',
  
  // Disable telemetry
  productionBrowserSourceMaps: false,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
