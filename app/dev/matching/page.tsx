import { notFound } from 'next/navigation';
import { MatchingPreviewClient } from './MatchingPreviewClient';

export default function MatchingPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <MatchingPreviewClient />;
}
