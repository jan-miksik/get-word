import { SchoolStatsPage } from '@/features/schools/public.client';

export const metadata = { title: 'School overview' };

export default function SchoolOverviewRoute() {
  return (
    <SchoolStatsPage
      endpoint="/api/schools/me/stats"
      backHref="/"
      backLabelKey="schoolStats.backToApp"
    />
  );
}
