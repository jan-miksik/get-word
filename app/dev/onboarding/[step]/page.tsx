import { notFound } from 'next/navigation';
import { OnboardingDevPreview } from '../onboarding-dev-preview';
import { isPreviewStep } from '../steps';

/**
 * A direct link to one onboarding step: `/dev/onboarding/goal`,
 * `/dev/onboarding/reminder`, and so on. The toolbar can switch steps too, but
 * a URL per step is what makes a screen quick to reopen and quick to frame at a
 * given size (see `/dev/onboarding/mobile`).
 */
export default async function OnboardingStepDevPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { step } = await params;
  if (!isPreviewStep(step)) notFound();
  return <OnboardingDevPreview initialStep={step} />;
}
