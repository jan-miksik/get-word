import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SuccessMarkSlot } from '../SuccessMark';

describe('SuccessMarkSlot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the solid appearance and rolls a new entrance for every reveal', () => {
    const random = vi.spyOn(Math, 'random');
    random
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.21)
      .mockReturnValueOnce(0.41)
      .mockReturnValueOnce(0.61)
      .mockReturnValueOnce(0.81);

    const { rerender } = render(<SuccessMarkSlot show={false} label="Correct" rollKey="word" />);

    for (const animation of ['pop', 'stamp', 'drop', 'draw', 'bloom']) {
      rerender(<SuccessMarkSlot show label="Correct" rollKey="word" />);
      expect(screen.getByRole('img', { name: 'Correct' })).toHaveAttribute(
        'data-success-mark',
        `${animation}/solid`,
      );
      rerender(<SuccessMarkSlot show={false} label="Correct" rollKey="word" />);
    }
  });
});
