import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppKitProvider } from '@/components/AppKitProvider';
import './globals.css';
import './.generated/tailwind.css';

export const metadata: Metadata = {
  title: 'Language Helper',
  description: 'Learn Czech and Vietnamese with spaced repetition',
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


