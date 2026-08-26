'use client';

import type { ReactNode } from 'react';

import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';
import { pluralForm } from '@/lib/i18n/plural';
import type { SessionBlockKind } from '@/features/learning/session/blocks';
import type { SessionFlowState } from '@/features/learning/session/flow';

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
 * What the work so far has actually amounted to, in the two units the learner
 * thinks in: words met for the first time, and words brought back.
 *
 * It belongs at a seam rather than on the study surface. Mid-card, a running
 * tally is something to watch instead of the word; at a pause the stretch just
 * finished is the whole subject, and the numbers are the answer to the question
 * the pause raises by itself. Both the breather and the card that closes the
 * day are such seams, which is why this lives on its own.
 */
export function SessionRecap({
  reviewed,
  fresh,
  className = '',
  style,
}: {
  reviewed: number;
  fresh: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t, language } = useI18n();
  if (reviewed === 0 && fresh === 0) return null;

  return (
    <ul
      className={`m-0 mt-5 flex list-none flex-wrap items-center justify-center gap-2 p-0 text-sm font-bold text-[#4a4032] ${className}`.trim()}
      style={style}
    >
      {reviewed > 0 ? (
        <RecapChip color="var(--rail-review)">
          {t(pluralForm(RECAP_REVIEWED, language, reviewed), { count: reviewed })}
        </RecapChip>
      ) : null}
      {fresh > 0 ? (
        <RecapChip color="var(--rail-new)">
          {t(pluralForm(RECAP_NEW, language, fresh), { count: fresh })}
        </RecapChip>
      ) : null}
    </ul>
  );
}

/** What a plan's own blocks say was answered, split the way the recap reads. */
export function countPlanDone(flow: SessionFlowState, kind: SessionBlockKind): number {
  return flow.blocks.reduce((sum, block) => (block.kind === kind ? sum + block.done : sum), 0);
}

/**
 * One unit of work as a pill rather than a bullet: the two numbers sit side by
 * side on a phone instead of stacking into a list, and the coloured dot keeps
 * the session rails' vocabulary — blue for repeats, green for new words.
 */
function RecapChip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <li
      className="flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 tabular-nums"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {children}
    </li>
  );
}
