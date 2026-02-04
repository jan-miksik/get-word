const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Required for OpenNext/Cloudflare
  webpack: (config) => {
    // Stub optional @wagmi/connectors peer deps (Coinbase, MetaMask, Gemini, Porto, WalletConnect).
    // See: https://github.com/wevm/wagmi/issues/4906
    const emptyModule = path.join(__dirname, 'lib', 'wagmi-empty-module.js');
    config.resolve.alias = {
      '@coinbase/wallet-sdk': emptyModule,
      '@gemini-wallet/core': emptyModule,
      '@metamask/sdk': emptyModule,
      'porto/internal': emptyModule,
      porto: emptyModule,
      ...config.resolve.alias,
    };
    return config;
  },
};

module.exports = nextConfig;
