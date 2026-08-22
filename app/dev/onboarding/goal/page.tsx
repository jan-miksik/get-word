import { notFound } from 'next/navigation';
import { OnboardingDevPreview } from '../onboarding-dev-preview';

export default function GoalOnboardingDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <OnboardingDevPreview initialScenario="returning-no-goal" />;
}
