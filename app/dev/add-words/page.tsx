import { notFound } from 'next/navigation';
import { AddWordsDevPreview } from './add-words-dev-preview';

export default function AddWordsDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <AddWordsDevPreview />;
}
