import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { PhotoLabPage } from '@/features/photo-lab/components/PhotoLabPage';

// Display font for Photo Lab headings only; subsets cover every UI locale
// (cs/en latin-ext, uk cyrillic, vi vietnamese). The official variable font
// is checked in so production builds do not depend on Google Fonts networking.
const displayFont = localFont({
  src: './fonts/Unbounded-VariableFont_wght.ttf',
  weight: '200 900',
  display: 'swap',
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
