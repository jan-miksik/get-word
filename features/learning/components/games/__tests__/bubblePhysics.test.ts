import { describe, expect, it } from 'vitest';

import {
  createBubbleBodies,
  pushBubblesFrom,
  rescaleBubbleField,
  seededRandom,
  stepBubbleField,
  type BubbleSize,
} from '../bubblePhysics';

const FIELD = { width: 360, height: 520 };

function sizesOf(count: number, width = 96, height = 46): BubbleSize[] {
  return Array.from({ length: count }, (_, index) => ({ id: `w${index}`, width, height }));
}

function insideField(body: { x: number; y: number; hw: number; hh: number }, field = FIELD) {
  return (
    body.x - body.hw >= -0.01 &&
    body.x + body.hw <= field.width + 0.01 &&
    body.y - body.hh >= -0.01 &&
    body.y + body.hh <= field.height + 0.01
  );
}

describe('createBubbleBodies', () => {
  it('creates one body per size and keeps every bubble inside the field', () => {
    const bodies = createBubbleBodies(sizesOf(8), FIELD, 'seed');
    expect(bodies).toHaveLength(8);
    for (const body of bodies) expect(insideField(body)).toBe(true);
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(createBubbleBodies(sizesOf(6), FIELD, 'a')).toEqual(createBubbleBodies(sizesOf(6), FIELD, 'a'));
    expect(createBubbleBodies(sizesOf(6), FIELD, 'a')).not.toEqual(createBubbleBodies(sizesOf(6), FIELD, 'b'));
  });

  it('scatters rather than stacking', () => {
    const bodies = createBubbleBodies(sizesOf(8), FIELD, 'seed');
    let worst = Infinity;
    for (let a = 0; a < bodies.length; a += 1) {
      for (let b = a + 1; b < bodies.length; b += 1) {
        worst = Math.min(worst, Math.hypot(bodies[a].x - bodies[b].x, bodies[a].y - bodies[b].y));
      }
    }
    expect(worst).toBeGreaterThan(30);
  });

  it('gives every bubble a drift of its own', () => {
    const bodies = createBubbleBodies(sizesOf(8), FIELD, 'seed');
    const headings = new Set(bodies.map((body) => Math.round(Math.atan2(body.vy, body.vx) * 100)));
    expect(headings.size).toBeGreaterThan(5);
    for (const body of bodies) expect(Math.hypot(body.vx, body.vy)).toBeGreaterThan(0);
  });
});

describe('stepBubbleField', () => {
  it('keeps bubbles inside the field over a long run', () => {
    const bodies = createBubbleBodies(sizesOf(10), FIELD, 'seed');
    const random = seededRandom('drift');
    for (let frame = 0; frame < 1500; frame += 1) {
      stepBubbleField(bodies, FIELD, 1 / 60, random);
      for (const body of bodies) expect(insideField(body)).toBe(true);
    }
  });

  it('moves bubbles on both axes rather than along one line', () => {
    const bodies = createBubbleBodies(sizesOf(6), FIELD, 'seed');
    const start = bodies.map((body) => ({ x: body.x, y: body.y }));
    const random = seededRandom('drift');
    for (let frame = 0; frame < 120; frame += 1) stepBubbleField(bodies, FIELD, 1 / 60, random);
    for (const [index, body] of bodies.entries()) {
      expect(Math.abs(body.x - start[index].x) + Math.abs(body.y - start[index].y)).toBeGreaterThan(1);
    }
  });

  it('bounces bubbles off each other instead of letting them pass through', () => {
    const bodies = [
      { id: 'a', x: 100, y: 260, vx: 40, vy: 0, hw: 40, hh: 20 },
      { id: 'b', x: 260, y: 260, vx: -40, vy: 0, hw: 40, hh: 20 },
    ];
    const random = () => 0.5; // no wander, so only the collision can turn them
    // Long enough to meet in the middle, short enough that no wall is reached.
    for (let frame = 0; frame < 100; frame += 1) stepBubbleField(bodies, FIELD, 1 / 60, random);
    expect(bodies[0].x).toBeLessThan(bodies[1].x);
    expect(bodies[0].vx).toBeLessThan(0);
  });

  it('pins a bubble wider than the field instead of letting it hang off the edge', () => {
    const narrow = { width: 200, height: 400 };
    const bodies = [{ id: 'a', x: 10, y: 40, vx: 60, vy: 30, hw: 140, hh: 24 }];
    const random = seededRandom('drift');
    for (let frame = 0; frame < 60; frame += 1) stepBubbleField(bodies, narrow, 1 / 60, random);
    expect(bodies[0].x).toBe(narrow.width / 2);
    expect(bodies[0].y - bodies[0].hh).toBeGreaterThanOrEqual(0);
  });

  it('ignores frozen bodies', () => {
    const bodies = [{ id: 'a', x: 100, y: 100, vx: 50, vy: 50, hw: 30, hh: 20, frozen: true }];
    stepBubbleField(bodies, FIELD, 1 / 60, seededRandom('drift'));
    expect(bodies[0].x).toBe(100);
    expect(bodies[0].y).toBe(100);
  });

  it('clamps an oversized frame so a backgrounded tab cannot teleport a bubble', () => {
    const bodies = [{ id: 'a', x: 180, y: 260, vx: 40, vy: 0, hw: 30, hh: 20 }];
    stepBubbleField(bodies, FIELD, 5, () => 0.5);
    expect(bodies[0].x).toBeLessThanOrEqual(180 + 42 * 0.05 + 0.01);
  });
});

describe('pushBubblesFrom', () => {
  it('accelerates neighbours away from the origin and skips frozen bodies', () => {
    const bodies = [
      { id: 'a', x: 200, y: 260, vx: 0, vy: 0, hw: 30, hh: 20 },
      { id: 'b', x: 100, y: 260, vx: 0, vy: 0, hw: 30, hh: 20, frozen: true },
    ];
    pushBubblesFrom(bodies, { x: 150, y: 260 }, 120);
    expect(bodies[0].vx).toBeGreaterThan(0);
    expect(bodies[1].vx).toBe(0);
  });
});

describe('rescaleBubbleField', () => {
  it('moves bubbles with the viewport and keeps them in bounds', () => {
    const bodies = createBubbleBodies(sizesOf(6), FIELD, 'seed');
    const next = { width: 180, height: 300 };
    rescaleBubbleField(bodies, FIELD, next, sizesOf(6));
    for (const body of bodies) expect(insideField(body, next)).toBe(true);
  });
});
