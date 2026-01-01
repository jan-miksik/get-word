/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Required for OpenNext/Cloudflare
};

module.exports = nextConfig;
