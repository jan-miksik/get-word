import type { Metadata } from 'next';
import { MyReportsPage } from '@/features/moderation/public.client';

export const metadata: Metadata = {
  title: 'Content reports — Get Word',
  robots: { index: false, follow: false },
};

export default function ReportsRoute() {
  return <MyReportsPage />;
}
