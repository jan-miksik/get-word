import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { headers } from 'next/headers';
import { AppKitProvider } from '@/components/AppKitProvider';
import { PWARegister } from '@/components/PWARegister';
import './globals.css';
import './.generated/tailwind.css';

export const metadata: Metadata = {
  title: 'Language Helper',
  description: 'Learn Czech and Vietnamese with spaced repetition',
  applicationName: 'Language Helper',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Language Helper',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: '/favicon.ico' }],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
  // Allow content to fill under the notch/home-indicator so env(safe-area-inset-*)
  // give the real inset values instead of 0.
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const cookies = headersList.get('cookie');

  return (
    <html lang="en">
      <head>
        {/* Privacy-friendly analytics by Plausible */}
        <Script
          async
          strategy="beforeInteractive"
          src="https://plausible.io/js/pa-xFN0TxunpPMudN4mQmPvT.js"
        />
        <Script id="plausible-init" strategy="beforeInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=window.plausible.init||function(i){plausible.o=i||{}};
plausible.init()`}
        </Script>
      </head>
      <body>
        <AppKitProvider cookies={cookies}>
          <PWARegister />
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}
