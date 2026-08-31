import { notFound } from 'next/navigation';
import { AssemblyPreviewClient } from './AssemblyPreviewClient';

export default function AssemblyPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <AssemblyPreviewClient />;
}
