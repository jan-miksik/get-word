import { notFound } from 'next/navigation';

import { DesignSystemDevPreview } from './design-system-dev-preview';

export default function DesignSystemDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignSystemDevPreview />;
}
