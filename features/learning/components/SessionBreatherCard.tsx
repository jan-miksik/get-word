'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionBlockKind } from '@/features/learning/session/blocks';
import type { SessionBreather } from '@/features/learning/session/useSessionBreather';
import { SessionCardShell } from './SessionCardShell';
import { SessionRecap, countPlanDone } from './SessionRecap';

/**
 * The pause between two blocks.
 *
 * The screen says one thing: *this kind of work is finished, that kind starts
 * now*. It used to say it five times over — a generic "Block done" heading, a
 * "New words: 6 done" line, a "30/41" counter, an "11 left" line and an "Up
 * next: review (11)" line — which is a report, not a handover. Now the handover
 * is the picture, the heading and its one supporting line are the words, and
 * the day's standing shrinks to a single bar underneath.
 *
 * The end of the day is not one of these. It is a state rather than a seam —
 * nothing starts after it — so it belongs to the empty deck, in
 * `SessionDoneCard`, and this card no longer has a "day complete" shape.
 */
function kindColor(kind: SessionBlockKind): string {
  return kind === 'review' ? 'var(--rail-review)' : 'var(--rail-new)';
}

/**
 * The handover, drawn as two nodes on a track: what is behind you, dimmed and
 * ticked off, and what is in front, in full colour with its size inside it.
 *
 * The same vocabulary as the session rails at the edges of the study surface —
 * same two colours, same halo on whatever is current — so the pause reads as a
 * bigger view of the thing the learner has been watching all session.
 */
function Handover({ from, to, count }: { from: SessionBlockKind; to: SessionBlockKind; count: number }) {
  const fromColor = kindColor(from);
  const toColor = kindColor(to);
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-base font-black text-white opacity-45"
        style={{ background: fromColor }}
      >
        ✓
      </span>
      <span
        className="session-handover-track h-[2px] w-12 rounded-full"
        style={{ background: `linear-gradient(to right, ${fromColor}, ${toColor})` }}
      />
      <span
        className="session-handover-next flex h-14 w-14 items-center justify-center rounded-full text-xl font-black tabular-nums text-white"
        style={{ background: toColor, boxShadow: `0 0 0 6px color-mix(in srgb, ${toColor} 18%, transparent)` }}
      >
        {count}
      </span>
    </div>
  );
}

export function SessionBreatherCard({
  breather,
  onContinue,
  showDayProgress = true,
}: {
  breather: SessionBreather;
  onContinue: () => void;
  /**
   * A minutes day is not measured in cards, and its countdown strip is already
   * on screen above this card — so the day bar would be a second, disagreeing
   * answer to "how far along am I". The recap above it stays either way.
   */
  showDayProgress?: boolean;
}) {
  const { t } = useI18n();
  const { flow } = breather;
  const dayPercent = flow.dayTotal > 0 ? Math.min(100, Math.round((flow.dayDone / flow.dayTotal) * 100)) : 0;
  const remaining = Math.max(0, flow.dayTotal - flow.dayDone);

  return (
    <SessionCardShell>
      <Handover from={breather.finished.kind} to={breather.next.kind} count={breather.next.total} />

      <h2 className="m-0 mt-3 text-2xl font-black leading-tight tracking-[-0.025em] text-[#1f1a12] sm:text-[1.8rem]">
        {t(
          breather.finished.kind === 'review'
            ? 'learning.sessionBreatherDoneReview'
            : 'learning.sessionBreatherDoneNew',
        )}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed text-[#4a4032] sm:text-base">
        {t(
          breather.next.kind === 'review'
            ? 'learning.sessionBreatherNextUpReview'
            : 'learning.sessionBreatherNextUpNew',
        )}
      </p>

      <SessionRecap reviewed={countPlanDone(flow, 'review')} fresh={countPlanDone(flow, 'new')} />

      {/* Where the day stands — the number the rail deliberately does not
          carry, kept to one bar and, while work remains, one line. */}
      <div className={`mx-auto max-w-xs ${showDayProgress ? 'mt-6' : 'sr-only'}`}>
        <div
          className="h-1.5 overflow-hidden rounded-full"
          style={{ background: 'var(--rail-track)' }}
          role="progressbar"
          aria-label={t('learning.sessionDayLabel')}
          aria-valuemin={0}
          aria-valuemax={flow.dayTotal}
          aria-valuenow={flow.dayDone}
        >
          <div
            className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${dayPercent}%`, background: 'var(--rail-review)' }}
          />
        </div>
        {showDayProgress && remaining > 0 ? (
          <p className="m-0 mt-2 text-xs tabular-nums text-[#4a4032]">
            {t('learning.sessionDayRemaining', { count: remaining, total: flow.dayTotal })}
          </p>
        ) : null}
      </div>

      <div className="mx-auto mt-7 flex max-w-xs flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="onboarding-option onboarding-option-highlight min-h-12 rounded-full px-5 py-3 text-base font-extrabold"
        >
          {t('learning.sessionBreatherAction')}
        </button>
      </div>
    </SessionCardShell>
  );
}
