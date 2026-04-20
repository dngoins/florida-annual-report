/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API routes proxy to backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL || 'http://localhost:8000'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
