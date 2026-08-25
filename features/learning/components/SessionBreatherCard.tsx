'use client';

import type { ReactNode } from 'react';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import { pluralForm } from '@/lib/i18n/plural';
import type { SessionBlockKind } from '@/features/learning/session/blocks';
import type { SessionFlowState } from '@/features/learning/session/flow';
import { formatDuration } from '@/features/learning/goals/useStudyCountdown';
import type { SessionBreather } from '@/features/learning/session/useSessionBreather';

/**
 * The pause between two blocks, and the day's one and only scoreboard.
 *
 * Like its sibling interstitials this renders inside the study surface rather
 * than `.onboarding-screen`, so the `--ob-*` variables are undefined and the
 * warm ink palette is written out directly.
 *
 * The screen says one thing: *this kind of work is finished, that kind starts
 * now*. It used to say it five times over — a generic "Block done" heading, a
 * "New words: 6 done" line, a "30/41" counter, an "11 left" line and an "Up
 * next: review (11)" line — which is a report, not a handover. Now the handover
 * is the picture, the heading and its one supporting line are the words, and
 * the day's standing shrinks to a single bar underneath.
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

const RECAP_REVIEWED = {
  one: 'learning.sessionRecapReviewed.one',
  few: 'learning.sessionRecapReviewed.few',
  many: 'learning.sessionRecapReviewed.many',
} satisfies Record<string, I18nKey>;
const RECAP_NEW = {
  one: 'learning.sessionRecapNew.one',
  few: 'learning.sessionRecapNew.few',
  many: 'learning.sessionRecapNew.many',
} satisfies Record<string, I18nKey>;

/**
 * What the day has actually amounted to so far, in the two units the learner
 * thinks in: words met for the first time, and words brought back.
 *
 * It belongs at the seam rather than on the study surface. Mid-card, a running
 * tally is something to watch instead of the word; here the work of the stretch
 * just finished is the whole subject, and the numbers are the answer to the
 * question the pause raises by itself.
 */
function Recap({ flow }: { flow: SessionFlowState }) {
  const { t, language } = useI18n();
  const doneOf = (kind: SessionBlockKind) =>
    flow.blocks.reduce((sum, block) => (block.kind === kind ? sum + block.done : sum), 0);
  const reviewed = doneOf('review');
  const fresh = doneOf('new');
  if (reviewed === 0 && fresh === 0) return null;

  return (
    <ul className="m-0 mt-5 flex list-none flex-col items-center gap-1 p-0 text-sm font-bold text-[#4a4032]">
      {reviewed > 0 ? (
        <RecapLine color="var(--rail-review)">
          {t(pluralForm(RECAP_REVIEWED, language, reviewed), { count: reviewed })}
        </RecapLine>
      ) : null}
      {fresh > 0 ? (
        <RecapLine color="var(--rail-new)">
          {t(pluralForm(RECAP_NEW, language, fresh), { count: fresh })}
        </RecapLine>
      ) : null}
    </ul>
  );
}

function RecapLine({ color, children }: { color: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 tabular-nums">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {children}
    </li>
  );
}

function CompletionMark() {
  return (
    <div className="relative mx-auto h-24 w-28" aria-hidden>
      <span className="absolute left-1 top-5 h-2.5 w-1.5 -rotate-[24deg] rounded-full bg-[#f0a11a]" />
      <span className="absolute left-5 top-0 h-2 w-2 rotate-12 rounded-sm bg-[#3f8f4d]" />
      <span className="absolute bottom-3 left-3 h-1.5 w-3 rotate-[28deg] rounded-full bg-[#d85b5b]" />
      <span className="absolute right-2 top-3 h-3 w-1.5 rotate-[32deg] rounded-full bg-[#d85b5b]" />
      <span className="absolute right-0 top-12 h-2.5 w-2.5 rotate-12 rounded-sm bg-[#f0a11a]" />
      <span className="absolute bottom-1 right-5 h-1.5 w-3 -rotate-[32deg] rounded-full bg-[#3f8f4d]" />
      <span
        className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        style={{ background: 'color-mix(in srgb, var(--rail-review) 13%, transparent)' }}
      >
        <span
          className="flex h-14 w-14 -rotate-3 items-center justify-center rounded-[1.15rem] text-white shadow-[0_10px_24px_rgba(30,111,168,0.28)]"
          style={{ background: 'linear-gradient(145deg, #2684bd, var(--rail-review))' }}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m6.5 12.5 3.4 3.4 7.6-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </div>
  );
}

export function SessionBreatherCard({
  breather,
  onContinue,
  shortfall = 0,
  extraReviewCount = 0,
  result = null,
  showDayProgress = true,
  onAddWords,
  onContinueExtra,
}: {
  breather: SessionBreather;
  onContinue: () => void;
  /**
   * How far the day's plan fell short of the goal for want of words. A day that
   * ran out of words is not a day earned, so it is not celebrated as one — it
   * ends on the way to get more instead.
   */
  shortfall?: number;
  /** Repeats deliberately left out of the day; offered, never required. */
  extraReviewCount?: number;
  /**
   * What the finished day actually cost. The session strip spends the day
   * estimating this; here it is settled, which is the only moment the learner
   * can check the estimate against the real thing.
   */
  result?: { activeMs: number; itemsDone: number; secondsPerItem: number } | null;
  /**
   * A minutes day is not measured in cards, and its countdown strip is already
   * on screen above this card — so the day bar would be a second, disagreeing
   * answer to "how far along am I". The recap above it stays either way.
   */
  showDayProgress?: boolean;
  onAddWords?: () => void;
  onContinueExtra?: () => void;
}) {
  const { t } = useI18n();
  const { flow } = breather;
  const dayPercent = flow.dayTotal > 0 ? Math.min(100, Math.round((flow.dayDone / flow.dayTotal) * 100)) : 0;
  const remaining = Math.max(0, flow.dayTotal - flow.dayDone);
  const complete = breather.kind === 'complete';
  const shortOfGoal = complete && shortfall > 0;
  const offersExtra = complete && !shortOfGoal && extraReviewCount > 0 && Boolean(onContinueExtra);

  return (
    <div className="flex h-full min-h-64 items-center justify-center px-2 py-8 sm:px-4">
      <section className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(145deg,#fffaf0_0%,#f7f0df_60%,#edf6f8_100%)] px-6 py-8 text-center text-[#1f1a12] shadow-[0_22px_60px_rgba(42,34,24,0.12)] sm:px-10 sm:py-10">
        {complete && !shortOfGoal ? (
          <>
            <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#1e6fa8]/10" aria-hidden />
            <span className="pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-[#3f8f4d]/10" aria-hidden />
          </>
        ) : null}
        <div className="relative">
          {breather.kind === 'between' ? (
            <Handover
              from={breather.finished.kind}
              to={breather.next.kind}
              count={breather.next.total}
            />
          ) : shortOfGoal ? (
            <div className="text-4xl" aria-hidden>🌱</div>
          ) : (
            <CompletionMark />
          )}

          <h2 className="m-0 mt-3 text-2xl font-black leading-tight tracking-[-0.025em] text-[#1f1a12] sm:text-[1.8rem]">
            {breather.kind === 'between'
              ? t(
                  breather.finished.kind === 'review'
                    ? 'learning.sessionBreatherDoneReview'
                    : 'learning.sessionBreatherDoneNew',
                )
              : shortOfGoal
                ? t('learning.sessionDayShortTitle')
                : t('learning.sessionDayDoneTitle')}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed text-[#4a4032] sm:text-base">
            {breather.kind === 'between'
              ? t(
                  breather.next.kind === 'review'
                    ? 'learning.sessionBreatherNextUpReview'
                    : 'learning.sessionBreatherNextUpNew',
                )
              : shortOfGoal
                ? t('learning.sessionDayShortBody', { count: shortfall })
                : t('learning.sessionDayDoneBody')}
          </p>

          {breather.kind === 'between' ? <Recap flow={flow} /> : null}

          {complete && !shortOfGoal && result && result.itemsDone > 0 ? (
            <p className="m-0 mt-4 text-sm font-bold tabular-nums text-[#4a4032]">
              {t('goal.dayResult', {
                time: formatDuration(result.activeMs),
                count: result.itemsDone,
                seconds: Math.round(result.secondsPerItem),
              })}
            </p>
          ) : null}

          {/* Where the day stands — the number the rail deliberately does not
              carry, kept to one bar and, while work remains, one line. */}
          <div
            className={`mx-auto max-w-xs ${(complete && !shortOfGoal) || !showDayProgress ? 'sr-only' : 'mt-6'}`}
          >
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
            {!complete && showDayProgress && remaining > 0 ? (
              <p className="m-0 mt-2 text-xs tabular-nums text-[#4a4032]">
                {t('learning.sessionDayRemaining', { count: remaining, total: flow.dayTotal })}
              </p>
            ) : null}
          </div>

          <div className="mx-auto mt-7 flex max-w-xs flex-col items-stretch gap-2">
            {shortOfGoal && onAddWords ? (
              <button
                type="button"
                onClick={onAddWords}
                className="onboarding-option onboarding-option-highlight min-h-12 rounded-full px-5 py-3 text-base font-extrabold"
              >
                {t('learning.sessionDayAddWords')}
              </button>
            ) : null}
            {/* A closed day gets one button, not a choice of two. Where repeats
                are waiting past the plan that button is the offer to take them —
                it says how many and that their time has come — and leaving is a
                plain link underneath, because stopping needs no encouragement. */}
            {offersExtra ? (
              <button
                type="button"
                onClick={onContinueExtra}
                className="onboarding-option onboarding-option-highlight min-h-16 rounded-[1.35rem] px-5 py-3 text-center shadow-[0_9px_24px_rgba(30,111,168,0.28)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="block text-lg font-black leading-tight">
                  {t('learning.sessionDayExtraAction', { count: extraReviewCount })}
                </span>
                <span className="mt-0.5 block text-xs font-bold opacity-80">
                  {t('learning.sessionDayExtraHint')}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onContinue}
                className={`onboarding-option min-h-12 rounded-full px-5 py-3 text-base font-extrabold${
                  shortOfGoal && onAddWords ? '' : ' onboarding-option-highlight'
                }`}
              >
                {complete ? t('learning.sessionDayDoneAction') : t('learning.sessionBreatherAction')}
              </button>
            )}
            {offersExtra ? (
              <button
                type="button"
                onClick={onContinue}
                className="m-0 rounded-full bg-transparent px-4 py-2 text-sm font-bold text-[#4a4032] transition-colors hover:bg-[#2a2218]/5 hover:text-[#1f1a12]"
              >
                {t('learning.sessionDayDoneAction')}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
