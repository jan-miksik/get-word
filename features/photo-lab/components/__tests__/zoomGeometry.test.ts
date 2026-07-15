import { describe, expect, it } from 'vitest';
import {
  applyPinch,
  clampTransform,
  zoomAtPoint,
} from '@/features/photo-lab/components/zoomGeometry';

const VIEWPORT = { width: 100, height: 100 };

describe('photo zoom geometry', () => {
  it('clamps scale and translation so the photo always covers the viewport', () => {
    expect(clampTransform({ scale: 0.5, tx: -20, ty: 10 }, VIEWPORT)).toEqual({
      scale: 1,
      tx: 0,
      ty: 0,
    });
    expect(clampTransform({ scale: 5, tx: -999, ty: 50 }, VIEWPORT)).toEqual({
      scale: 4,
      tx: -300,
      ty: 0,
    });
  });

  it('keeps the previous pinch midpoint anchored under the new midpoint', () => {
    expect(
      applyPinch(
        { scale: 1, tx: 0, ty: 0 },
        { x: 50, y: 50 },
        100,
        { x: 60, y: 70 },
        200,
        VIEWPORT,
      ),
    ).toEqual({ scale: 2, tx: -40, ty: -30 });
  });

  it('zooms around the requested viewport point', () => {
    expect(
      zoomAtPoint(
        { scale: 1, tx: 0, ty: 0 },
        { x: 25, y: 75 },
        2.5,
        VIEWPORT,
      ),
    ).toEqual({ scale: 2.5, tx: -37.5, ty: -112.5 });
  });

  it('ignores a zero-distance pinch without producing invalid numbers', () => {
    expect(
      applyPinch(
        { scale: 2, tx: -25, ty: -30 },
        { x: 50, y: 50 },
        0,
        { x: 60, y: 60 },
        20,
        VIEWPORT,
      ),
    ).toEqual({ scale: 2, tx: -25, ty: -30 });
  });
});
