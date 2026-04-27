/** @type {import('next').NextConfig} */

// Fallback is REQUIRED for Docker / CI build
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9000'

const nextConfig = {
  reactStrictMode: true,
  
  // REQUIRED for ECS Docker
//  output: 'standalone',
  
  // IMPORTANT: ALB path
  // basePath: '/stdreux/admin',
  // assetPrefix: '/stdreux/admin/',
  
  images: {
    unoptimized: true, // recommended for ALB + ECS
    domains: ['localhost', 'stdreux.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.railway.app',
      },
      {
        protocol: 'https',
        hostname: '**.s3.ap-southeast-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '**.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'caterly-uploads-unique-id.s3.ap-southeast-2.amazonaws.com',
      },
    ],
  },
  
  // Optimize for faster navigation
  experimental: {
    optimizePackageImports: ['lucide-react', '@tanstack/react-query'],
  },
  
  // Enable prefetching for faster navigation
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
