import type { Metadata } from 'next';
import { PhotoLabPage } from '@/features/photo-lab/components/PhotoLabPage';

export const metadata: Metadata = {
  title: 'Photo lab',
  robots: { index: false },
};

export default function PhotoLabRoute() {
  return <PhotoLabPage />;
}
