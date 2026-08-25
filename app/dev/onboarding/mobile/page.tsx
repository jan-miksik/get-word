import { notFound } from 'next/navigation';
import { OnboardingFrames } from './onboarding-frames';

export default function OnboardingFramesDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <OnboardingFrames />;
}
