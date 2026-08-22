import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StageBadge } from '../StageBadge';

describe('StageBadge', () => {
  it('quietly combines the repetition interval with the exercise level', () => {
    render(<StageBadge stageIndex={3} difficultyBand="II" />);
    expect(screen.getByRole('img', { name: '3 days · II' })).toHaveTextContent('3 days · II');
  });
});
