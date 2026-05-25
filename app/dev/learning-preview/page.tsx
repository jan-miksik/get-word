import { notFound } from 'next/navigation';
import { PreviewLearningPage } from '@/features/learning/preview/PreviewLearningPage';

export default function LearningPreviewRoute() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <PreviewLearningPage />;
}
