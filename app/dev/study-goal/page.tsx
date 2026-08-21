import { notFound } from 'next/navigation';

import { StudyGoalDevPreview } from './study-goal-dev-preview';

export default function StudyGoalDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <StudyGoalDevPreview />;
}
