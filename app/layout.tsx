import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Language Helper',
  description: 'Learn Czech and Vietnamese with spaced repetition',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


