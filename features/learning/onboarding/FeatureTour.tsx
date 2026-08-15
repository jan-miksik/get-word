'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  resolveAvailableTourSteps,
  tourAnchorSelector,
  type FeatureTourStep,
} from './featureTourSteps';

type Props = {
  /** Called once the learner reaches the end or leaves early; never repeats. */
  onFinish: () => void;
};

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 14;
const TOOLTIP_WIDTH = 300;
const VIEWPORT_MARGIN = 12;
// Conservative stand-in for the card's own height, which is not known until it
// has rendered. Overestimating only costs a flip to the other side.
const TOOLTIP_ROOM = 190;
// Above this share of the viewport the spotlight is effectively the whole
// screen, and there is no outside left to put the card in.
const FULLSCREEN_ANCHOR_RATIO = 0.55;

function readAnchorRect(step: FeatureTourStep): AnchorRect | null {
  const element = document.querySelector(tourAnchorSelector(step.anchor));
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
}

/**
 * Coach marks over the app's own controls: a dimmed screen with the current
 * control cut out of it, and a card explaining what that control does.
 *
 * Every step can be left — Skip, Escape, or a click on the dimmed area — because
 * a tour a learner cannot escape is worse than no tour. Anchors are measured
 * from the live DOM rather than hard-coded, so the cut-out stays on the control
 * when the bar reflows on a narrow phone.
 */
export function FeatureTour({ onFinish }: Props) {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  // Frozen at mount: which controls exist can change while the tour is open
  // (the menu opens, the surface switches), and a step list that shrinks
  // underneath the learner would jump them mid-sentence.
  const [steps, setSteps] = useState<FeatureTourStep[]>(() =>
    resolveAvailableTourSteps(document),
  );
  const [rect, setRect] = useState<AnchorRect | null>(null);

  const step = steps[stepIndex] ?? null;
  const isLastStep = stepIndex >= steps.length - 1;

  useEffect(() => {
    const sync = () => {
      // The anchors live in sibling subtrees that commit after this component's
      // own render, so the pass during render finds nothing whenever the tour
      // and the study surface appear in the same commit — which is exactly what
      // `?previewFeatureTour` does. Resolve once more now that the tree is on
      // screen, then freeze as described above.
      if (steps.length === 0) {
        const resolved = resolveAvailableTourSteps(document);
        if (resolved.length > 0) setSteps(resolved);
        return;
      }
      if (step) setRect(readAnchorRect(step));
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [step, steps.length]);

  const finish = useCallback(() => onFinish(), [onFinish]);

  const advance = useCallback(() => {
    if (isLastStep) {
      finish();
      return;
    }
    setStepIndex((index) => index + 1);
  }, [finish, isLastStep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finish]);

  const tooltipStyle = useMemo(() => {
    if (!rect) return undefined;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferredLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const maxLeft = viewportWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN;
    const base = {
      left: Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, Math.max(VIEWPORT_MARGIN, maxLeft))),
      width: TOOLTIP_WIDTH,
      maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    };

    // The study step highlights the whole card, so there is no gap beside it to
    // sit in — the card goes over the middle of the spotlight instead of being
    // pushed off the bottom of the screen.
    if (rect.height > viewportHeight * FULLSCREEN_ANCHOR_RATIO) {
      return { ...base, top: '50%', transform: 'translateY(-50%)' };
    }
    const below = rect.top + rect.height + TOOLTIP_GAP;
    if (below + TOOLTIP_ROOM + VIEWPORT_MARGIN <= viewportHeight) {
      return { ...base, top: below };
    }
    return { ...base, bottom: viewportHeight - rect.top + TOOLTIP_GAP };
  }, [rect]);

  // Nothing to point at — a tour with no anchors is not worth a dimmed screen.
  if (!step || !rect) return null;

  return (
    <div
      className="fixed inset-0 z-[900]"
      role="dialog"
      aria-modal="true"
      aria-label={t('tour.label')}
    >
      {/* The cut-out: a transparent box over the control, with an enormous
          spread shadow standing in for the dimmed rest of the screen. Clicking
          the dim leaves the tour, so the control underneath stays reachable. */}
      <div
        className="absolute rounded-xl"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: '0 0 0 9999px rgba(20, 14, 6, 0.62)',
          pointerEvents: 'none',
        }}
      />
      {/* Leaving by clicking the dim, the same as the panel backdrops. Hidden
          from assistive tech on purpose: the Skip button and Escape are the
          labelled ways out, and a second control called "Skip" would just be
          an ambiguous duplicate. */}
      <div className="absolute inset-0" onClick={finish} aria-hidden />

      <section
        className="absolute rounded-2xl bg-[#f1ebdc] p-4 text-left text-[#1f1a12] shadow-xl"
        style={tooltipStyle}
      >
        <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wider text-[#7c6a55]">
          {t('tour.progress', { current: stepIndex + 1, total: steps.length })}
        </p>
        <h2 className="m-0 mt-1 text-lg font-black leading-tight">{t(step.titleKey)}</h2>
        <p className="m-0 mt-2 text-sm leading-relaxed text-[#4a4032]">{t(step.bodyKey)}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="border-none bg-transparent p-0 text-xs font-bold text-[#7c6a55] underline"
          >
            {t('tour.skip')}
          </button>
          <button
            type="button"
            onClick={advance}
            className="onboarding-option onboarding-option-highlight rounded-xl px-4 py-2 text-sm font-extrabold"
          >
            {isLastStep ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </section>
    </div>
  );
}
