import type { I18nKey } from '@/lib/i18n/locales/en';

/**
 * The tour points at real controls rather than describing them, so each step
 * names a `data-tour` anchor that has to exist in the DOM. Steps whose anchor
 * is missing — the photo lab when it is switched off, the surface bar when the
 * top-bar shortcuts are hidden — are dropped rather than rendered against a
 * guessed position.
 */
export type FeatureTourAnchor = 'study' | 'chat' | 'photo';

export interface FeatureTourStep {
  anchor: FeatureTourAnchor;
  titleKey: I18nKey;
  bodyKey: I18nKey;
}

const FEATURE_TOUR_STEPS: readonly FeatureTourStep[] = [
  {
    anchor: 'study',
    titleKey: 'tour.studyTitle',
    bodyKey: 'tour.studyBody',
  },
  {
    anchor: 'chat',
    titleKey: 'tour.chatTitle',
    bodyKey: 'tour.chatBody',
  },
  {
    anchor: 'photo',
    titleKey: 'tour.photoTitle',
    bodyKey: 'tour.photoBody',
  },
];

export function tourAnchorSelector(anchor: FeatureTourAnchor): string {
  return `[data-tour="${anchor}"]`;
}

/** Keeps only the steps whose anchor is actually on screen right now. */
export function resolveAvailableTourSteps(
  doc: Pick<Document, 'querySelector'>,
  steps: readonly FeatureTourStep[] = FEATURE_TOUR_STEPS
): FeatureTourStep[] {
  return steps.filter((step) => doc.querySelector(tourAnchorSelector(step.anchor)) !== null);
}
