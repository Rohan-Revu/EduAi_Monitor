/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow connecting to local backend during dev
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
