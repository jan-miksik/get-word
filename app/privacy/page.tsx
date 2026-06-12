import type { Metadata } from 'next';
import { LocalizedLegalPage } from '@/app/legal/LocalizedLegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — Get Word',
  description: 'How Get Word collects, uses, and protects your data.',
};

export default function PrivacyPolicyPage() {
  return <LocalizedLegalPage kind="privacy" />;
}
