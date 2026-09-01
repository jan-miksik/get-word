import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressStatsContent } from '../progress/ProgressStatsContent';
import { STAGES } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';

const TOP = STAGES.length - 1;

function statsWith(overrides: Partial<ProgressStats>): ProgressStats {
  return {
    total: 10,
    byStage: STAGES.map(() => 0),
    totalKnown: 0,
    totalUnknown: 0,
    readyCount: 0,
    fresh: 0,
    learning: 0,
    done: 0,
    new: 0,
    retired: 0,
    ...overrides,
  };
}

function stageRow(label: RegExp): HTMLElement {
  const cell = screen.getByText(label);
  const row = cell.parentElement;
  if (!row) throw new Error('stage row not found');
  return row;
}

describe('ProgressStatsContent', () => {
  it('gives retired words their own row and keeps them out of the 60-day one', () => {
    const byStage = STAGES.map(() => 0);
    byStage[TOP] = 5;

    render(<ProgressStatsContent progressStats={statsWith({ byStage, retired: 3 })} />);

    expect(stageRow(/fully known/i)).toHaveTextContent('3');
    expect(stageRow(/^60 days$/i)).toHaveTextContent('2');
  });

  it('drops the 60-day row entirely once every word there is retired', () => {
    const byStage = STAGES.map(() => 0);
    byStage[TOP] = 3;

    render(<ProgressStatsContent progressStats={statsWith({ byStage, retired: 3 })} />);

    expect(screen.getByText(/fully known/i)).toBeInTheDocument();
    expect(screen.queryByText(/^60 days$/i)).not.toBeInTheDocument();
  });

  it('labels the answer tallies as knowing and not knowing', () => {
    render(<ProgressStatsContent progressStats={statsWith({ totalKnown: 7, totalUnknown: 3 })} />);

    expect(screen.getByText(/^I know$/)).toBeInTheDocument();
    expect(screen.getByText(/^Don't know$/)).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
  });
});
