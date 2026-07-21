import type { Metadata } from 'next';
import { SchoolRedeemClient } from './SchoolRedeemClient';

export const metadata: Metadata = {
  title: 'School access - Get Word',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function SchoolRedeemPage() {
  return <SchoolRedeemClient />;
}
