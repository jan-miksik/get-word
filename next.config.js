const path = require('path');
const { execSync } = require('child_process');

const optionalWalletPackages = [
  '@coinbase/wallet-sdk',
  '@gemini-wallet/core',
  '@metamask/sdk',
  'porto/internal',
  'porto',
];

function createOptionalWalletAliases(emptyModule) {
  return Object.fromEntries(
    optionalWalletPackages.map((packageName) => [packageName, emptyModule])
  );
}

function getBuildVersion() {
  const base = require('./package.json').version;
  if (process.env.NODE_ENV !== 'production') {
    return base;
  }

  try {
    const count = execSync('git rev-list --count HEAD', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
    // Replace patch segment with commit count so version auto-increments per commit
    const [major, minor] = base.split('.');
    return `${major}.${minor}.${count}`;
  } catch {
    return base;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: getBuildVersion(),
  },
  reactStrictMode: true,
  output: 'standalone', // Required for OpenNext/Cloudflare
  turbopack: {
    resolveAlias: createOptionalWalletAliases('./lib/wagmi-empty-module.js'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Popup-based social auth flows may need access to the opener window.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ];
  },
  webpack: (config) => {
    // Stub optional @wagmi/connectors peer deps (Coinbase, MetaMask, Gemini, Porto, WalletConnect).
    // See: https://github.com/wevm/wagmi/issues/4906
    config.resolve.alias = {
      ...createOptionalWalletAliases(path.join(__dirname, 'lib', 'wagmi-empty-module.js')),
      ...config.resolve.alias,
    };
    return config;
  },
};

module.exports = nextConfig;
