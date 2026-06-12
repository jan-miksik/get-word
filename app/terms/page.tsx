import type { Metadata } from 'next';
import { LocalizedLegalPage } from '@/app/legal/LocalizedLegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service — Get Word',
  description: 'The terms that govern your use of Get Word.',
};

export default function TermsOfServicePage() {
  return <LocalizedLegalPage kind="terms" />;
}
