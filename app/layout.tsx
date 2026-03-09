import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { AppKitProvider } from '@/components/AppKitProvider';
import './globals.css';
import './.generated/tailwind.css';

export const metadata: Metadata = {
  title: 'Language Helper',
  description: 'Learn Czech and Vietnamese with spaced repetition',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}


