import type { Metadata, Viewport } from 'next';
import { Unbounded } from 'next/font/google';
import { PhotoLabPage } from '@/features/photo-lab/components/PhotoLabPage';

// Display font for Photo Lab headings only; subsets cover every UI locale
// (cs/en latin-ext, uk cyrillic, vi vietnamese). Self-hosted by next/font.
const displayFont = Unbounded({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'vietnamese'],
  variable: '--font-photo-display',
});

export const metadata: Metadata = {
  title: 'Photo lab',
  robots: { index: false },
};

// Route-level viewport replaces (not merges) the root layout's, so the base
// fields are repeated; themeColor matches the warm shell instead of the navy
// app body so mobile Safari's collapsing toolbars blend with this page.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F4EFE2',
};

export default function PhotoLabRoute() {
  return (
    <div className={displayFont.variable}>
      <PhotoLabPage />
    </div>
  );
}
