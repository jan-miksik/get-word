import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { AppKitProvider } from '@/components/AppKitProvider';
import { PWARegister } from '@/components/PWARegister';
import './globals.css';
import './.generated/tailwind.css';

export const metadata: Metadata = {
  title: 'Get Word',
  description: 'Learn Czech and Vietnamese with spaced repetition',
  applicationName: 'Get Word',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Get Word',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/get-word-logo.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: ['/get-word-logo.svg'],
    apple: [
      {
        url: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
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
      <body>
        <AppKitProvider cookies={cookies}>
          <PWARegister />
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}
