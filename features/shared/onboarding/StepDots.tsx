'use client';

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
  /** Drops the caption line where vertical space is scarce (phone keyboard up). */
  compact?: boolean;
}) {
  const position = Math.min(Math.max(current, 1), total);

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-valuetext={caption}
        className="flex items-center gap-1.5"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={[
              'h-2.5 flex-1 rounded-full border-2 border-[color:var(--ob-ink,#2A2218)] transition-colors',
              index < position
                ? 'bg-[color:var(--ob-accent,#1E6FA8)]'
                : 'bg-[color:var(--ob-surface,#F4EFE2)]',
            ].join(' ')}
          />
        ))}
      </div>
      {compact ? null : (
        <p className="m-0 mt-2 text-xs font-black uppercase tracking-[0.13em] text-[color:var(--ob-ink-soft,#6B5E48)]">
          {captionText ? `${caption} \u00b7 ${captionText}` : caption}
        </p>
      )}
    </div>
  );
}
