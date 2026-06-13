import type { Metadata } from 'next';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = {
  title: 'Sign in - Get Word',
  description:
    'Sign in to Get Word to sync language-learning lists, study progress, app settings, and spaced-repetition reviews across devices.',
  alternates: {
    canonical: '/login',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return <LoginClient />;
}
