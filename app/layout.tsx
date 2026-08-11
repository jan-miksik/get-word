import type { Metadata, Viewport } from 'next';
import { PWARegister } from '@/components/PWARegister';
import { WebPlatformProvider } from './WebPlatformProvider';
import './globals.css';
import './tailwind.css';

const SITE_URL = 'https://getword.app';
const SITE_TITLE = 'Get Word';
const SITE_DESCRIPTION =
  'Learn languages with spaced repetition and configurable word lists';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: 'Get Word',
  manifest: '/manifest.webmanifest',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Get Word — learn languages with spaced repetition',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Get Word',
  },
  formatDetection: {
    telephone: false,
  },
  // Disable browser auto-translation (Chrome/Edge). This is a multi-language
  // learning app, so machine-translating the UI and word content corrupts it.
  other: {
    google: 'notranslate',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: ['/icons/icon-192.png'],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
  themeColor: '#0b1220',
  // Allow content to fill under the notch/home-indicator so env(safe-area-inset-*)
  // give the real inset values instead of 0.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body translate="no" className="notranslate">
        <PWARegister />
        <WebPlatformProvider>{children}</WebPlatformProvider>
      </body>
    </html>
  );
}
