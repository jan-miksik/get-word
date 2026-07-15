import { describe, expect, it } from 'vitest';
import { resolveChipCollisions } from '@/features/photo-lab/components/resolveChipCollisions';
import type { PhotoLabLabel } from '@/features/photo-lab/types';

function label(id: string, x: number, y: number): PhotoLabLabel {
  return { id, known: id, target: id, x, y, w: 0.1, h: 0.1 };
}

describe('resolveChipCollisions', () => {
  it('keeps non-overlapping chips in place', () => {
    const result = resolveChipCollisions([label('a', 0.2, 0.2), label('b', 0.8, 0.8)]);
    expect(result.find((item) => item.id === 'a')).toMatchObject({ x: 0.2, y: 0.2 });
    expect(result.find((item) => item.id === 'b')).toMatchObject({ x: 0.8, y: 0.8 });
  });

  it('nudges an overlapping chip downward', () => {
    const result = resolveChipCollisions([label('a', 0.5, 0.5), label('b', 0.5, 0.51)]);
    const a = result.find((item) => item.id === 'a')!;
    const b = result.find((item) => item.id === 'b')!;
    expect(a.y).toBe(0.5);
    expect(b.y).toBeGreaterThan(0.51);
    expect(Math.abs(b.y - a.y)).toBeGreaterThanOrEqual(0.05);
  });

  it('gives up after bounded nudges in a dense cluster instead of drifting far', () => {
    const cluster = Array.from({ length: 6 }, (_, index) => label(`c${index}`, 0.5, 0.5));
    const result = resolveChipCollisions(cluster);
    for (const item of result) {
      expect(item.y).toBeLessThanOrEqual(0.5 + 4 * 0.05);
    }
  });

  it('clamps chips near edges into the visible area', () => {
    const result = resolveChipCollisions([label('a', 0.001, 0.999)]);
    expect(result[0].x).toBeCloseTo(0.03);
    expect(result[0].y).toBeCloseTo(0.97);
  });

  it('does not mutate the input array or its labels', () => {
    const input = [label('a', 0.5, 0.9), label('b', 0.5, 0.1)];
    const snapshot = JSON.parse(JSON.stringify(input));
    resolveChipCollisions(input);
    expect(input).toEqual(snapshot);
  });
});
