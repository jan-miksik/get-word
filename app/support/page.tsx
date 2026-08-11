import type { Metadata } from 'next';
import { LocalizedLegalPage } from '@/features/legal/public.client';

export const metadata: Metadata = {
  title: 'Support — Get Word',
  description: 'How to get help with Get Word, report a bug, or manage your account.',
  alternates: {
    canonical: '/support',
  },
};

export default function SupportPage() {
  return <LocalizedLegalPage kind="support" />;
}
