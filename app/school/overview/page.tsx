import { SchoolStatsPage } from '@/features/schools/components/SchoolStatsPage';

export const metadata = { title: 'School overview' };

export default function SchoolOverviewRoute() {
  return <SchoolStatsPage endpoint="/api/schools/me/stats" />;
}
