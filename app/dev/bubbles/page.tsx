import { notFound } from 'next/navigation';
import { BubblesPreviewClient } from './BubblesPreviewClient';

export default function BubblesPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <BubblesPreviewClient />;
}
