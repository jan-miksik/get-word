'use client';

import { useI18n } from '@/components/I18nProvider';
import { StepDots } from '@/features/shared/onboarding/StepDots';
import type { WordChatStep } from '../hooks/useWordChat';

/**
 * Adding words is three steps: collect them, check what came back, save.
 *
 * The conversation is not a fourth one — it is a way of filling the first step,
 * however many turns it takes, exactly as onboarding treats it. Drawn with the
 * same rail as first-run setup (`StepDots`), so the flow a learner met on day
 * one and the one they open every week look like the same app.
 */
const ORDER: WordChatStep[] = ['select', 'review', 'done'];

export function WordChatProgress({
  step,
  compact = false,
}: {
  step: WordChatStep;
  compact?: boolean;
}) {
  const { t } = useI18n();
  // The chat feeds the first step, so it shows the first step's position.
  const index = Math.max(0, ORDER.indexOf(step === 'chat' ? 'select' : step));
  const position = index + 1;
  const total = ORDER.length;
  const name = t(
    (['wordChat.stepWrite', 'wordChat.stepReview', 'wordChat.stepSaved'] as const)[index],
  );

  return (
    <StepDots
      total={total}
      current={position}
      label={t('wordChat.progressLabel')}
      caption={t('onboarding.progressStep', { step: position, total })}
      captionText={name}
      compact={compact}
    />
  );
}
