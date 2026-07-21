import { SchoolStatsPage } from '@/features/schools/components/SchoolStatsPage';

export default async function AdminSchoolStatsRoute({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  return (
    <SchoolStatsPage
      endpoint={`/api/admin/schools/${encodeURIComponent(schoolId)}/stats`}
      backHref="/admin/schools"
      backLabelKey="schoolStats.backToSchools"
    />
  );
}
