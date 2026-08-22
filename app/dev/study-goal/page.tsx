import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { StudyGoalDevPreview } from './study-goal-dev-preview';

export default function StudyGoalDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  // `useSearchParams` needs a boundary to bail out to client rendering.
  return (
    <Suspense>
      <StudyGoalDevPreview />
    </Suspense>
  );
}
