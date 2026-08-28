'use client';

import { useI18n } from '@/components/I18nProvider';
import type { SessionBlockKind } from '@/features/learning/session/blocks';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';
import type { SessionBreather } from '@/features/learning/session/useSessionBreather';
import type { LearningRole } from '@/features/learning/state/learningRole';
import { knownSideForRole } from '@/features/learning/state/learningRole';
import { getWordTextBySide } from './games/types';
import { SessionCardShell } from './SessionCardShell';
import { SessionRecap, countPlanDone } from './SessionRecap';

/**
 * The pause between two blocks.
 *
 * The screen says one thing: *this kind of work is finished, that kind starts
 * now*. It used to say it five times over — a generic "Block done" heading, a
 * "New words: 6 done" line, a "30/41" counter, an "11 left" line and an "Up
 * next: review (11)" line — which is a report, not a handover.
 *
 * Saying it once left the opposite problem: a heading, a line under it and a
 * count, identical at every seam of every day. So the pause now shows two
 * things it is uniquely placed to show. The whole day's plan is drawn as a
 * track the learner is walking along — the blocks behind ticked off, the one
 * starting now lit, the rest waiting — which is a different picture at every
 * seam and answers "how much of this is left" better than a percentage. And
 * the stretch that just ended is named in words rather than counted: the
 * actual items that went past, which is the only thing on this card that is
 * about the learner's own study rather than about the plan.
 *
 * The end of the day is not one of these. It is a state rather than a seam —
 * nothing starts after it — so it belongs to the empty deck, in
 * `SessionDoneCard`, and this card no longer has a "day complete" shape.
 */
function kindColor(kind: SessionBlockKind): string {
  return kind === 'review' ? 'var(--rail-review)' : 'var(--rail-new)';
}

/**
 * The day's plan as a track: everything behind the learner ticked and dimmed,
 * the block starting now in full colour with its size inside it, everything
 * still to come as an outline.
 *
 * It keeps the vocabulary of the session rails at the edges of the study
 * surface — the same two colours, the same left-to-right reading — so the pause
 * is a bigger view of the thing that has been in the corner of the eye all
 * session, rather than a new picture to learn.
 */
function DayTrack({
  blocks,
  currentIndex,
}: {
  blocks: readonly SessionBlockProgress[];
  currentIndex: number;
}) {
  return (
    <ol className="m-0 flex list-none items-center justify-center gap-0 p-0" aria-hidden>
      {blocks.map((block, index) => {
        const color = kindColor(block.kind);
        const previous = blocks[index - 1];
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={block.key} className="flex min-w-0 items-center">
            {index > 0 ? (
              <span
                className={`h-[2px] w-4 shrink-0 rounded-full sm:w-6 ${
                  current ? 'session-handover-track' : ''
                }`}
                style={{
                  background: current
                    ? `linear-gradient(to right, ${kindColor(previous?.kind ?? block.kind)}, ${color})`
                    : `color-mix(in srgb, ${color} ${done ? 40 : 18}%, transparent)`,
                }}
              />
            ) : null}
            {current ? (
              <span
                className="session-handover-next flex h-14 w-14 items-center justify-center rounded-full text-xl font-black tabular-nums text-white"
                style={{
                  background: color,
                  boxShadow: `0 0 0 6px color-mix(in srgb, ${color} 18%, transparent)`,
                }}
              >
                {block.total}
              </span>
            ) : done ? (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-white opacity-45"
                style={{ background: color }}
              >
                ✓
              </span>
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black tabular-nums"
                style={{
                  borderColor: `color-mix(in srgb, ${color} 38%, transparent)`,
                  color: `color-mix(in srgb, ${color} 78%, #1f1a12)`,
                }}
              >
                {block.total}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The stretch just finished, in words: the items themselves, dropped onto the
 * card one after another rather than summed into a number.
 */
const ROLL_CALL_LIMIT = 8;

function RollCall({ words }: { words: readonly string[] }) {
  const shown = words.slice(0, ROLL_CALL_LIMIT);
  const overflow = words.length - shown.length;
  return (
    <ul className="m-0 mt-4 flex list-none flex-wrap items-center justify-center gap-1.5 p-0">
      {shown.map((text, index) => (
        <li
          key={`${text}-${index}`}
          className="session-breather-word rounded-full bg-white/70 px-3 py-1 text-[0.8rem] font-bold text-[#4a4032] shadow-[0_1px_2px_rgba(42,34,24,0.06)]"
          style={{ animationDelay: `${120 + index * 55}ms` }}
        >
          {text}
        </li>
      ))}
      {overflow > 0 ? (
        <li
          className="session-breather-word rounded-full px-2.5 py-1 text-[0.8rem] font-bold tabular-nums text-[#7a6f5e]"
          style={{ animationDelay: `${120 + shown.length * 55}ms` }}
        >
          +{overflow}
        </li>
      ) : null}
    </ul>
  );
}

export function SessionBreatherCard({
  breather,
  role,
  onContinue,
  showDayProgress = true,
}: {
  breather: SessionBreather;
  /** Which side of a pair the learner already knows; see `RollCall`. */
  role: LearningRole;
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
  const answered = flow.dayDone + flow.dayPending;
  const dayPercent = flow.dayTotal > 0 ? Math.min(100, Math.round((answered / flow.dayTotal) * 100)) : 0;
  const remaining = Math.max(0, flow.dayTotal - answered);
  // The known side, never the side being learned: the block that starts now is
  // very often a pass over these same words, and printing the answers to it
  // directly above the button that opens it would be handing them over. The
  // known side is the prompt rather than the answer, so the roll-call says what
  // went by without giving anything away.
  //
  // Same word twice in a block — a reinforcement pass repeats what the new
  // block introduced — is one entry on the shelf, not two.
  const knownSide = knownSideForRole(role);
  const rollCall = Array.from(
    new Set(
      breather.words
        .map((word) => getWordTextBySide(word, knownSide).trim())
        .filter((text) => text.length > 0),
    ),
  );

  return (
    <SessionCardShell>
      <DayTrack blocks={flow.blocks} currentIndex={flow.index} />

      <h2 className="m-0 mt-4 text-2xl font-black leading-tight tracking-[-0.025em] text-[#1f1a12] sm:text-[1.8rem]">
        {t(
          breather.finished.kind === 'review'
            ? 'learning.sessionBreatherDoneReview'
            : 'learning.sessionBreatherDoneNew',
        )}
      </h2>

      {rollCall.length > 0 ? (
        <>
          <p className="m-0 mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#7a6f5e]">
            {t(
              breather.finished.kind === 'review'
                ? 'learning.sessionBreatherJustReview'
                : 'learning.sessionBreatherJustNew',
            )}
          </p>
          <RollCall words={rollCall} />
        </>
      ) : null}

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

      {/* What the button opens, said right where the button is: the card then
          reads past → present → forward, rather than announcing the next
          stretch above the heading that closes the last one. */}
      <div className="mx-auto mt-7 flex max-w-xs flex-col items-stretch gap-2">
        <p
          className="m-0 text-xs font-black uppercase tracking-[0.14em]"
          style={{ color: `color-mix(in srgb, ${kindColor(breather.next.kind)} 70%, #1f1a12)` }}
        >
          {t(
            breather.next.kind === 'review'
              ? 'learning.sessionBreatherNextUpReview'
              : 'learning.sessionBreatherNextUpNew',
          )}
        </p>
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
