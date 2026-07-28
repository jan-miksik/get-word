import type { Metadata, Viewport } from 'next';
import { photoDisplayFont } from '@/features/photo-lab/font';
import { PhotoLabPage } from '@/features/photo-lab/components/PhotoLabPage';

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
  interactiveWidget: 'resizes-content',
  viewportFit: 'cover',
  themeColor: '#F4EFE2',
};

/**
 * Standalone entry: bookmarks, shared links, and the settings link. Opening the
 * lab from the study view renders the same page in place instead (see
 * `app/HomeClient.tsx`), so the deck is still there on the way back.
 */
export default function PhotoLabRoute() {
  return (
    <div className={photoDisplayFont.variable}>
      <PhotoLabPage />
    </div>
  );
}
