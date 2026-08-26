'use client';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import { pluralForm } from '@/lib/i18n/plural';
import type { SessionFlowState } from '@/features/learning/session/flow';
import { formatDuration } from '@/features/learning/goals/useStudyCountdown';
import { SessionCardShell } from './SessionCardShell';
import { SessionRecap, countPlanDone } from './SessionRecap';
import { StreakSummary } from './goals/StreakDays';
import type { StreakChipData } from '@/features/learning/goals/streakWeek';

/**
 * What the study surface shows when the deck runs out — including the day.
 *
 * The end of a day used to be announced twice: an interstitial fired the moment
 * the plan was walked, and dismissing it uncovered this card saying the same
 * thing again, with the same offer. That is because a finished day was treated
 * as an *event*. It is a *state*: it lasts until there is something to study
 * again, and there is nothing to acknowledge — so it is drawn here, once, where
 * the empty deck already is. It leaves by itself the moment the deck refills,
 * which is exactly what taking the extra words does.
 *
 * Emptying the deck used to end in the words "All done!" and nothing else,
 * which is a dead end at exactly the moment someone still wants to study. So
 * every version of this screen carries a way forward: add new words. The
 * headline can be overridden for the cases that are not really "done" — an
 * empty filter, for instance — so those get the same exit rather than their own
 * dead end.
 *
 * Practising the words that are still settling used to be offered here as a
 * third button. It went: pulling words forward before their interval is due is
 * the one exit that works against the schedule, and offering it beside "add
 * words" made it look like an equal choice. Stream mode still lists them behind
 * `SettlingWordsFooter` for anyone who deliberately goes looking.
 *
 * An emptied deck is not the same as an empty backlog. The day's plan caps both
 * how many repeats it takes and how many new words it introduces, so a finished
 * plan can sit on top of dozens of words that are due this minute and a pile of
 * words the learner added an hour ago. Saying "the next batch is waiting
 * tomorrow" there is simply false, so whatever the plan left over is named and
 * offered — one opt-in, which lifts the day's cap on both at once.
 */
const SETTLING = {
  one: 'learning.sessionDoneSettling.one',
  few: 'learning.sessionDoneSettling.few',
  many: 'learning.sessionDoneSettling.many',
} satisfies Record<string, I18nKey>;
const EXTRA_DUE = {
  one: 'learning.sessionDoneExtraDue.one',
  few: 'learning.sessionDoneExtraDue.few',
  many: 'learning.sessionDoneExtraDue.many',
} satisfies Record<string, I18nKey>;
const NEW_LEFT = {
  one: 'learning.sessionDoneNewLeft.one',
  few: 'learning.sessionDoneNewLeft.few',
  many: 'learning.sessionDoneNewLeft.many',
} satisfies Record<string, I18nKey>;

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SURPLUS_RADIUS = 55;
const SURPLUS_CIRCUMFERENCE = 2 * Math.PI * SURPLUS_RADIUS;

/** Where the burst lands, in pixels from the middle of the seal. */
const SEAL_BITS = [
  { x: -72, y: -22, r: -24, w: 'w-1.5', h: 'h-3', round: 'rounded-full', color: '#f0a11a' },
  { x: -44, y: -64, r: 14, w: 'w-2', h: 'h-2', round: 'rounded-sm', color: '#3f8f4d' },
  { x: 15, y: -77, r: -12, w: 'w-1.5', h: 'h-3.5', round: 'rounded-full', color: '#d85b5b' },
  { x: 68, y: -46, r: 32, w: 'w-2', h: 'h-2', round: 'rounded-sm', color: '#1e6fa8' },
  { x: 75, y: 18, r: -28, w: 'w-3', h: 'h-1.5', round: 'rounded-full', color: '#f0a11a' },
  { x: -63, y: 40, r: 22, w: 'w-3', h: 'h-1.5', round: 'rounded-full', color: '#3f8f4d' },
];

/**
 * The day's own rail, closed into a circle.
 *
 * The bar that tracked the day all session ends as a ring that draws itself
 * shut and is stamped — the same two colours, the same left-to-right reading,
 * finished. Work done past the goal keeps going round on a second, thinner
 * outer lap in gold, because a day that went further than it had to should not
 * look identical to one that stopped on the mark. A day that ran out of words
 * instead gets the ring stopped where the day actually got to, with a seedling
 * in the middle: the picture says "not closed" before the heading does.
 */
function DaySeal({
  percent,
  closed,
  surplusPercent = 0,
}: {
  percent: number;
  closed: boolean;
  /** How far past the goal the day went, as a share of the goal itself. */
  surplusPercent?: number;
}) {
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, percent)));
  const surplusOffset = SURPLUS_CIRCUMFERENCE * (1 - Math.min(1, surplusPercent));
  return (
    <div className="relative mx-auto h-32 w-32" aria-hidden>
      {closed ? (
        <>
          <span className="session-seal-glow absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          {SEAL_BITS.map((bit, index) => (
            <span
              key={index}
              className={`session-seal-bit absolute left-1/2 top-1/2 ${bit.w} ${bit.h} ${bit.round}`}
              style={{
                background: bit.color,
                '--bit-x': `${bit.x}px`,
                '--bit-y': `${bit.y}px`,
                '--bit-r': `${bit.r}deg`,
                animationDelay: `${640 + index * 45}ms`,
              } as React.CSSProperties}
            />
          ))}
        </>
      ) : null}
      <svg viewBox="0 0 120 120" className="relative h-full w-full">
        <defs>
          <linearGradient id="session-seal-arc-fill" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--rail-new)" />
            <stop offset="100%" stopColor="var(--rail-review)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--rail-track)" strokeWidth="7" />
        <circle
          className="session-seal-arc"
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="url(#session-seal-arc-fill)"
          strokeWidth="7"
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{
            strokeDasharray: CIRCUMFERENCE,
            '--seal-arc-from': `${CIRCUMFERENCE}`,
            '--seal-arc-to': `${offset}`,
          } as React.CSSProperties}
        />
        {surplusPercent > 0 ? (
          <circle
            className="session-seal-surplus"
            cx="60"
            cy="60"
            r={SURPLUS_RADIUS}
            fill="none"
            stroke="#f0a11a"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{
              strokeDasharray: SURPLUS_CIRCUMFERENCE,
              '--seal-arc-from': `${SURPLUS_CIRCUMFERENCE}`,
              '--seal-arc-to': `${surplusOffset}`,
            } as React.CSSProperties}
          />
        ) : null}
        {closed ? (
          <path
            className="session-seal-tick"
            d="M42 61 55 74 79 46"
            fill="none"
            stroke="var(--rail-review)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      {closed ? null : (
        <span className="absolute inset-0 flex items-center justify-center text-3xl">🌱</span>
      )}
    </div>
  );
}

export function SessionDoneCard({
  title,
  settlingCount,
  dueNowCount = 0,
  newNowCount = 0,
  dayFlow = null,
  dayScore = null,
  shortfall = 0,
  dayResult = null,
  streak = null,
  onStudyExtra,
  onOpenWordChat,
}: {
  /** Overrides the default headline; the actions stay the same. */
  title?: string;
  /** Words resting before their next repeat; named in the body copy only. */
  settlingCount: number;
  /** Repeats due right now that today's plan did not take. */
  dueNowCount?: number;
  /** Words never studied that today's plan did not reach. */
  newNowCount?: number;
  /**
   * The day's plan, once there is one. Its `complete` flag is what turns this
   * from "nothing due" into the card that closes the day.
   */
  dayFlow?: SessionFlowState | null;
  /**
   * The day as the server counted it, which is the only source that includes
   * work done outside the plan — a bonus round, or a session that carried on
   * after the goal was met. The plan alone would report the goal back at the
   * learner however much they actually did.
   */
  dayScore?: { introduced: number; reviewed: number; target: number | null } | null;
  /**
   * How far the day's plan fell short of the goal for want of words. A day that
   * ran out of words is not a day earned, so it is not celebrated as one — it
   * ends on the way to get more instead.
   */
  shortfall?: number;
  /**
   * The two streaks and this week, shown only on a day that was actually
   * closed. A day that ran short is deliberately uncelebrated here, and a
   * series printed under "you're short" would read as a consolation prize.
   */
  streak?: StreakChipData | null;
  /**
   * What the finished day actually cost. The session strip spends the day
   * estimating this; here it is settled, which is the only moment the learner
   * can check the estimate against the real thing.
   */
  dayResult?: { activeMs: number; itemsDone: number; secondsPerItem: number } | null;
  /** Lifts the day's cap so the leftovers join the stream. */
  onStudyExtra?: () => void;
  onOpenWordChat?: () => void;
}) {
  const { t, language } = useI18n();
  const canCarryOn = Boolean(onStudyExtra);
  const dueLeft = canCarryOn ? dueNowCount : 0;
  const newLeft = canCarryOn ? newNowCount : 0;
  const waiting = dueLeft + newLeft;
  const planned = dayFlow && dayFlow.dayTotal > 0 ? dayFlow : null;
  const ranOut = Boolean(planned?.complete) && shortfall > 0;
  const dayClosed = Boolean(planned?.complete) && !ranOut;
  // A headline the caller supplied is about something other than the day —
  // filters, mostly — so it never gets the day's send-off.
  const celebrate = !title && planned !== null && (dayClosed || ranOut);

  const headline =
    title ??
    (ranOut
      ? t('learning.sessionDayShortTitle')
      : dayClosed || waiting > 0
        ? t('learning.sessionDayDoneTitle')
        : t('learning.sessionDoneTitle'));
  const body = ranOut
    ? t('learning.sessionDayShortBody', { count: shortfall })
    : dueLeft > 0 && newLeft > 0
      ? t('learning.sessionDoneBothLeft', { due: dueLeft, fresh: newLeft })
      : dueLeft > 0
        ? t(pluralForm(EXTRA_DUE, language, dueLeft), { count: dueLeft })
        : newLeft > 0
          ? t(pluralForm(NEW_LEFT, language, newLeft), { count: newLeft })
          : dayClosed
            ? t('learning.sessionDayDoneBody')
            : settlingCount > 0
              ? t(pluralForm(SETTLING, language, settlingCount), { count: settlingCount })
              : t('learning.sessionDoneBody');

  // Whatever the plan left over is one offer, not two lists: the round behind
  // this button holds the leftover repeats and the untouched new words alike,
  // and the label names whichever of them is actually waiting.
  const carryOn = waiting > 0
    ? dueLeft > 0 && newLeft > 0
      ? {
          label: t('learning.sessionDayMoreAction', { count: waiting }),
          hint: t('learning.sessionDayMoreHint', { due: dueLeft, fresh: newLeft }),
        }
      : dueLeft > 0
        ? {
            label: t('learning.sessionDayExtraAction', { count: dueLeft }),
            hint: t('learning.sessionDayExtraHint'),
          }
        : {
            label: t('learning.sessionDayNewAction', { count: newLeft }),
            hint: t('learning.sessionDayNewHint'),
          }
    : null;

  const actions = (
    <div className="mx-auto flex max-w-xs flex-col items-stretch gap-2">
      {carryOn ? (
        <button
          type="button"
          onClick={onStudyExtra}
          className="onboarding-option onboarding-option-highlight min-h-16 rounded-[1.35rem] px-5 py-3 text-center shadow-[0_9px_24px_rgba(30,111,168,0.28)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="block text-lg font-black leading-tight">{carryOn.label}</span>
          <span className="mt-0.5 block text-xs font-bold opacity-80">{carryOn.hint}</span>
        </button>
      ) : null}
      {onOpenWordChat ? (
        <button
          type="button"
          onClick={onOpenWordChat}
          className={[
            'onboarding-option min-h-12 rounded-full px-5 py-3 text-base font-extrabold',
            carryOn ? '' : 'onboarding-option-highlight',
          ].join(' ')}
        >
          {t('wordChat.addWords')}
        </button>
      ) : null}
    </div>
  );

  if (!celebrate) {
    return (
      <div className="study-ink-scope flex h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="m-0 max-w-md text-lg font-semibold text-text">{headline}</p>
        <p className="m-0 max-w-md text-sm text-text-soft">{body}</p>
        {actions}
      </div>
    );
  }

  // The day as it was actually lived. The server rollup is the whole day,
  // bonus round included; the plan is what this device just watched happen.
  // Whichever is further along is the true one — the rollup can lag a sync
  // behind, and the plan cannot see past its own cap.
  const reviewed = Math.max(dayScore?.reviewed ?? 0, planned ? countPlanDone(planned, 'review') : 0);
  const fresh = Math.max(dayScore?.introduced ?? 0, planned ? countPlanDone(planned, 'new') : 0);
  const surplus = dayScore?.target ? Math.max(0, reviewed + fresh - dayScore.target) : 0;

  // A day that ran out is measured against the goal it missed, not against the
  // plan it did finish — the plan had already been cut down to the words that
  // existed, so it would read as a full ring.
  const reached = planned?.dayDone ?? 0;
  const goalSize = reached + shortfall;
  const percent = dayClosed || goalSize === 0 ? 1 : reached / goalSize;

  return (
    <SessionCardShell celebratory={dayClosed}>
      <DaySeal
        percent={percent}
        closed={dayClosed}
        surplusPercent={surplus > 0 && dayScore?.target ? Math.min(1, surplus / dayScore.target) : 0}
      />

      {surplus > 0 ? (
        <p
          className="session-close-pop m-0 mx-auto -mt-1 w-fit rounded-full bg-[#f0a11a]/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-[#8a5a06]"
          style={{ animationDelay: '1180ms' }}
        >
          {t('learning.sessionDayOverGoal', { count: surplus })}
        </p>
      ) : null}

      <h2
        className="session-close-in m-0 mt-3 text-2xl font-black leading-tight tracking-[-0.025em] text-[#1f1a12] sm:text-[1.8rem]"
        style={{ animationDelay: '260ms' }}
      >
        {headline}
      </h2>
      <p
        className="session-close-in mx-auto mt-2 max-w-md text-sm font-medium leading-relaxed text-[#4a4032] sm:text-base"
        style={{ animationDelay: '340ms' }}
      >
        {body}
      </p>

      <SessionRecap
        reviewed={reviewed}
        fresh={fresh}
        className="session-close-in"
        style={{ animationDelay: '420ms' }}
      />

      {/* One numeric layer, not two: the recap above already counts the words,
          so what is left to add is what they cost. */}
      {dayResult && dayResult.itemsDone > 0 ? (
        <p
          className="session-close-in m-0 mt-3 text-xs font-bold tabular-nums text-[#4a4032] opacity-70"
          style={{ animationDelay: '500ms' }}
        >
          {t('learning.sessionDayTime', {
            time: formatDuration(dayResult.activeMs),
            seconds: Math.round(dayResult.secondsPerItem),
          })}
        </p>
      ) : null}

      {/* Not gated on the counts being above zero. The rollup that decides
          `met` is computed server-side and refreshed after the day closes, so
          on the very day it is earned both figures can still read 0 for a
          moment — and hiding the series exactly then is the one time it most
          wants to be seen. The week beside it is never empty. */}
      {dayClosed && streak ? (
        <div className="session-close-in" style={{ animationDelay: '540ms' }}>
          <StreakSummary streak={streak} />
        </div>
      ) : null}

      <div className="session-close-in mt-7" style={{ animationDelay: '580ms' }}>
        {actions}
      </div>
    </SessionCardShell>
  );
}
