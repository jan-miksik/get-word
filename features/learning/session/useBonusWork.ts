'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import type { SessionBlockKind } from './blocks';
import type { SessionFlowState } from './flow';

type ExtraWork = { reviewed: number; fresh: number };
type StoredExtraWork = ExtraWork & { scope: string; round: number };

function countDone(flow: SessionFlowState, kind: SessionBlockKind): number {
  return flow.blocks.reduce(
    (sum, block) =>
      block.kind === kind && !block.reinforcement ? sum + block.done + block.pending : sum,
    0,
  );
}

/** Keeps completed bonus rounds visible after their frozen plan is discarded. */
export function useBonusWork({
  closed,
  flow,
  scope,
  setContinuing,
}: {
  closed: boolean;
  flow: SessionFlowState;
  scope: string;
  setContinuing: Dispatch<SetStateAction<boolean>>;
}): { extra: ExtraWork | null; startBonusRound: () => void } {
  const [round, setRound] = useState(0);
  const [stored, setStored] = useState<StoredExtraWork | null>(null);

  const startBonusRound = useCallback(() => {
    setRound((current) => current + 1);
    setContinuing(true);
  }, [setContinuing]);

  useEffect(() => {
    if (!closed) return;
    const reviewed = countDone(flow, 'review');
    const fresh = countDone(flow, 'new');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored((previous) => {
      const base = previous?.scope === scope
        ? previous
        : { scope, round: -1, reviewed: 0, fresh: 0 };
      if (base.round >= round) return previous;
      return {
        scope,
        round,
        reviewed: base.reviewed + reviewed,
        fresh: base.fresh + fresh,
      };
    });
  }, [closed, flow, round, scope]);

  const current = stored?.scope === scope ? stored : null;
  const extra = current && (current.reviewed > 0 || current.fresh > 0)
    ? { reviewed: current.reviewed, fresh: current.fresh }
    : null;
  return { extra, startBonusRound };
}
