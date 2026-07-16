import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LabeledPhoto } from '@/features/photo-lab/components/LabeledPhoto';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

const LABELS: PhotoLabLabel[] = [
  { id: 'one', known: 'chair', target: 'židle', x: 0.3, y: 0.4, w: 0.1, h: 0.1 },
  { id: 'two', known: 'table', target: 'stůl', x: 0.6, y: 0.5, w: 0.1, h: 0.1 },
];

describe('LabeledPhoto', () => {
  beforeEach(() => window.localStorage.clear());

  it('brings the most recently clicked label in front', async () => {
    const user = userEvent.setup();
    render(<LabeledPhoto imageUrl="data:image/png;base64," labels={LABELS} />);
    const chair = screen.getByRole('button', { name: 'chair' });
    const table = screen.getByRole('button', { name: 'table' });

    await user.click(chair);
    expect(chair.parentElement).toHaveStyle({ zIndex: '20' });
    expect(table.parentElement).toHaveStyle({ zIndex: '1' });

    await user.click(table);
    expect(chair.parentElement).toHaveStyle({ zIndex: '1' });
    expect(table.parentElement).toHaveStyle({ zIndex: '20' });
  });
});
