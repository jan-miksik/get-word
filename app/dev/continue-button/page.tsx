import { notFound } from 'next/navigation';
import { ContinueButtonPreviewClient } from './ContinueButtonPreviewClient';

export default function ContinueButtonPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <ContinueButtonPreviewClient />;
}
