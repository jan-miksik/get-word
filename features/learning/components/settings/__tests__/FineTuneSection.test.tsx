import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FineTuneSection } from '../FineTuneSection';
import { DEFAULT_FINE_TUNE_CONFIG } from '@/features/learning/fine-tune/config';
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';

const setLearningFineTune = vi.fn<(config: FineTuneConfig) => void>();
let learningFineTune: FineTuneConfig = DEFAULT_FINE_TUNE_CONFIG;

vi.mock('@/context/AppStateContext', () => ({
  useAppStateContext: () => ({
    learningFineTune,
    setLearningFineTune: (config: FineTuneConfig) => setLearningFineTune(config),
  }),
}));

/** Open one stage's editor and scope the queries to its choice grid. */
async function openChoiceGrid(stageLabel: string) {
  const user = userEvent.setup();
  render(<FineTuneSection />);
  await user.click(screen.getByRole('button', { name: new RegExp(stageLabel) }));
  return { user, grid: within(screen.getByRole('group', { name: 'Choice' })) };
}

const savedStage = (index: number) => {
  expect(setLearningFineTune).toHaveBeenCalledTimes(1);
  return setLearningFineTune.mock.calls[0][0].stages[index];
};

beforeEach(() => {
  learningFineTune = DEFAULT_FINE_TUNE_CONFIG;
  setLearningFineTune.mockClear();
});

describe('FineTuneSection — choice options language', () => {
  it('edits the foreign direction by default', async () => {
    const { user, grid } = await openChoiceGrid('3 days');

    expect(grid.getByRole('radio', { name: 'Pick the foreign word' })).toBeChecked();

    // The default ladder already has this one, so the click switches it off —
    // which is enough to show the grid is writing foreign-side variants.
    await user.click(grid.getByRole('checkbox', { name: '4 · III' }));
    expect(savedStage(3).choice.variants).not.toContain('4:III:foreign');
    expect(savedStage(3).choice.variants).toContain('5:III:foreign');
  });

  it('writes known-language variants once the switch is flipped', async () => {
    const { user, grid } = await openChoiceGrid('3 days');

    await user.click(grid.getByRole('radio', { name: 'Pick the word in your language' }));
    await user.click(grid.getByRole('checkbox', { name: '4 · III' }));

    const variants = savedStage(3).choice.variants;
    expect(variants).toContain('4:III:known');
    // Flipping the switch only changes what is being edited, never what is set.
    expect(variants).toContain('4:III:foreign');
  });

  it('marks the direction that is set but folded away', async () => {
    learningFineTune = {
      ...DEFAULT_FINE_TUNE_CONFIG,
      stages: DEFAULT_FINE_TUNE_CONFIG.stages.map((stage, index) =>
        index === 3 ? { ...stage, choice: { ...stage.choice, variants: ['4:II:known'] } } : stage,
      ),
    };
    const { user, grid } = await openChoiceGrid('3 days');

    // Nothing on the foreign side, so the editor opens on the side that has
    // something, and the empty one carries no marker.
    expect(grid.getByRole('radio', { name: 'Pick the word in your language' })).toBeChecked();
    expect(grid.getByRole('radio', { name: 'Pick the foreign word' })).toHaveTextContent(
      /^Pick the foreign word$/,
    );

    // Folding that half away has to leave a trace, or the stage looks empty.
    await user.click(grid.getByRole('radio', { name: 'Pick the foreign word' }));
    expect(grid.getByRole('radio', { name: /Pick the word in your language/ })).toHaveTextContent(
      '•',
    );
  });
});
