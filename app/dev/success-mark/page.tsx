import { notFound } from 'next/navigation';
import { SuccessMarkPreviewClient } from './SuccessMarkPreviewClient';

export default function SuccessMarkPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <SuccessMarkPreviewClient />;
}
