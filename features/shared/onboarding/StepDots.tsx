'use client';

import type { ReactNode } from 'react';

/**
 * The segmented step rail used by every ordered flow drawn on the warm
 * onboarding palette — first-run setup, and adding words from inside the app.
 *
 * One component so the two cannot drift: a learner who has just walked the
 * five setup screens should recognise the same rail above "Add words" rather
 * than meet a second dialect of progress a week later.
 *
 * Caller-supplied labels only. The rail knows how many segments there are and
 * which one is current; naming the steps is the flow's own business.
 */
export function StepDots({
  total,
  current,
  label,
  caption,
  captionText,
  compact = false,
  steps,
  onStepSelect,
}: {
  total: number;
  /** 1-based position of the step being shown. */
  current: number;
  /** Accessible name of the whole rail. */
  label: string;
  /** Human wording of the position, e.g. "Step 2 of 5"; also the aria value text. */
  caption: string;
  /** Optional extra line under the rail, e.g. the current step's own name. */
  captionText?: string;
  /**
   * Drops the caption line, leaving the rail to speak for itself. Used where
   * vertical space is scarce (phone keyboard up) and by first-run onboarding,
   * whose five one-question screens do not need a header each. The caption is
   * still the rail's accessible value text either way.
   */
  compact?: boolean;
  /**
   * Optional names/icons for flows whose completed steps can be revisited.
   * The icon is drawn once its step has been reached — the step underway and
   * every step behind it. Steps still ahead stay blank: a bell on a reminder
   * screen nobody has got to yet is decoration, and it would make the filled
   * run of the rail harder to read at a glance. Supplying `steps` also sets the
   * rail's height, so it does not grow as the icons arrive.
   */
  steps?: readonly { label: string; icon?: ReactNode }[];
  /** Called with a 1-based position. Only completed steps are interactive. */
  onStepSelect?: (position: number) => void;
}) {
  const position = Math.min(Math.max(current, 1), total);
  const interactive = Boolean(onStepSelect && steps?.length === total);

  const rail = (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => {
        const completed = index < position - 1;
        const filled = index < position;
        const step = steps?.[index];
        const className = [
          'flex flex-1 items-center justify-center rounded-full border-2 border-[color:var(--ob-ink,var(--ink))] transition-[background-color,transform,box-shadow]',
          step ? 'h-8' : 'h-2.5',
          filled
            ? 'bg-[color:var(--ob-accent,var(--sea))] text-white'
            : 'bg-[color:var(--ob-surface,var(--paper))] text-[color:var(--ob-ink-soft,var(--ink-soft))]',
          completed && interactive
            ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_2px_0_var(--ob-ink,var(--ink))] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--ob-accent,var(--sea))_28%,transparent)]'
            : '',
        ].join(' ');

        if (completed && interactive && step) {
          return (
            <button
              key={index}
              type="button"
              className={className}
              aria-label={step.label}
              title={step.label}
              onClick={() => onStepSelect?.(index + 1)}
            >
              {step.icon}
            </button>
          );
        }

        // Reached steps keep their mark — including the one underway, and
        // finished ones where going back is not offered. Steps ahead stay bare.
        // No `title` here either way: `step.label` is worded as a way back
        // ("Back: Level"), which is a lie on a segment that leads nowhere.
        return (
          <span key={index} aria-hidden className={className}>
            {filled ? step?.icon : null}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-valuetext={caption}
        className={interactive ? 'sr-only' : undefined}
      >
        {interactive ? null : rail}
      </div>
      {interactive ? rail : null}
      {compact ? null : (
        <p className="m-0 mt-2 text-xs font-black uppercase tracking-[0.13em] text-[color:var(--ob-ink-soft,var(--ink-soft))]">
          {captionText ? `${caption} \u00b7 ${captionText}` : caption}
        </p>
      )}
    </div>
  );
}
