import { notFound } from 'next/navigation';
import { TiltPreviewClient } from './TiltPreviewClient';

export default function TiltPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <TiltPreviewClient />;
}
