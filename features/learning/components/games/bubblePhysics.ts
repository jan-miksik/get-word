/**
 * A tiny soft-body field for the bubble minigame.
 *
 * Bubbles do not follow a scripted path: they drift, meander, bounce off the
 * field's edges and off each other. That is the whole point of the exercise —
 * a scatter that keeps moving reads as a field of things to catch, where a grid
 * of animated buttons reads as a quiz. Everything here is framework-neutral and
 * mutates plain objects, so the render layer can run it inside one rAF loop
 * without re-rendering React on every frame.
 *
 * Bubbles are pills, not circles, so collisions are resolved in a normalised
 * space where each *pair* maps onto a unit circle (dx / (hwA + hwB),
 * dy / (hhA + hhB)). It is an approximation, but it keeps wide bubbles from
 * reserving a huge circular hole around themselves.
 */

export interface BubbleBody {
  id: string;
  /** Centre of the bubble, in pixels relative to the field's top-left. */
  x: number;
  y: number;
  /** Velocity in pixels per second. */
  vx: number;
  vy: number;
  /** Half extents in pixels, measured from the rendered element. */
  hw: number;
  hh: number;
  /** A frozen body still blocks nothing and is skipped by the integrator. */
  frozen?: boolean;
}

export interface BubbleFieldSize {
  width: number;
  height: number;
}

export interface BubbleSize {
  id: string;
  width: number;
  height: number;
}

/** Drift speed band, px/s. Slow enough to tap, fast enough to feel alive. */
const MIN_SPEED = 9;
const MAX_SPEED = 42;
const START_SPEED_MIN = 14;
const START_SPEED_MAX = 30;
/** Random acceleration, px/s². This is what makes the paths look unplanned. */
const WANDER = 26;
/** Bubbles keep a little air between them instead of touching, in px. */
const GAP = 6;
/** Slightly inelastic, so a shockwave settles instead of ringing forever. */
const RESTITUTION = 0.92;
const RELAX_PASSES = 80;
/** Longest frame the integrator will honour; a backgrounded tab must not teleport. */
const MAX_STEP_SECONDS = 0.05;

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Keeps a bubble fully inside the field and bounces it off the wall it hit.
 *
 * A bubble wider than the field (a long phrase on a narrow phone) is centred
 * and pinned on that axis rather than jittering between two impossible walls —
 * this is the guard that stops words from ending up off screen.
 */
function constrainToField(body: BubbleBody, field: BubbleFieldSize): void {
  if (body.hw * 2 >= field.width) {
    body.x = field.width / 2;
    body.vx = 0;
  } else if (body.x - body.hw < 0) {
    body.x = body.hw;
    body.vx = Math.abs(body.vx);
  } else if (body.x + body.hw > field.width) {
    body.x = field.width - body.hw;
    body.vx = -Math.abs(body.vx);
  }

  if (body.hh * 2 >= field.height) {
    body.y = field.height / 2;
    body.vy = 0;
  } else if (body.y - body.hh < 0) {
    body.y = body.hh;
    body.vy = Math.abs(body.vy);
  } else if (body.y + body.hh > field.height) {
    body.y = field.height - body.hh;
    body.vy = -Math.abs(body.vy);
  }
}

/** Separates every overlapping pair; `strength` of 1 resolves the overlap fully. */
function separate(bodies: BubbleBody[], strength: number, random: () => number): void {
  for (let a = 0; a < bodies.length; a += 1) {
    for (let b = a + 1; b < bodies.length; b += 1) {
      const first = bodies[a];
      const second = bodies[b];
      const radiusX = first.hw + second.hw + GAP;
      const radiusY = first.hh + second.hh + GAP;
      let dx = second.x - first.x;
      let dy = second.y - first.y;
      if (dx === 0 && dy === 0) {
        dx = (random() - 0.5) * 0.1 || 0.05;
        dy = (random() - 0.5) * 0.1 || 0.05;
      }
      const normalized = Math.hypot(dx / radiusX, dy / radiusY);
      if (normalized >= 1 || normalized === 0) continue;
      const correction = (1 / normalized - 1) * 0.5 * strength;
      const pushX = dx * correction;
      const pushY = dy * correction;
      first.x -= pushX;
      first.y -= pushY;
      second.x += pushX;
      second.y += pushY;
    }
  }
}

function clampSpeed(body: BubbleBody, random: () => number): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed === 0) {
    const angle = random() * Math.PI * 2;
    body.vx = Math.cos(angle) * MIN_SPEED;
    body.vy = Math.sin(angle) * MIN_SPEED;
    return;
  }
  if (speed < MIN_SPEED) {
    const scale = MIN_SPEED / speed;
    body.vx *= scale;
    body.vy *= scale;
  } else if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    body.vx *= scale;
    body.vy *= scale;
  }
}

export function createBubbleBodies(
  sizes: readonly BubbleSize[],
  field: BubbleFieldSize,
  seed: string,
): BubbleBody[] {
  const random = seededRandom(`bubbles:${seed}:${sizes.map((size) => size.id).join('|')}`);
  // Stratified, not uniform: one bubble per cell of a jittered grid. Pure random
  // starts clump on one side of the field often enough to look broken, and the
  // jitter is what keeps the result from reading as a grid.
  const columns = Math.max(
    1,
    Math.round(Math.sqrt((sizes.length * field.width) / Math.max(field.height, 1))),
  );
  const rows = Math.max(1, Math.ceil(sizes.length / columns));
  const cells = Array.from({ length: columns * rows }, (_, index) => index);
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [cells[index], cells[target]] = [cells[target], cells[index]];
  }

  const bodies: BubbleBody[] = sizes.map((size, index) => {
    const hw = Math.min(size.width, field.width) / 2;
    const hh = Math.min(size.height, field.height) / 2;
    const cell = cells[index];
    const cellWidth = field.width / columns;
    const cellHeight = field.height / rows;
    return {
      id: size.id,
      hw,
      hh,
      x: (cell % columns) * cellWidth + cellWidth * (0.2 + random() * 0.6),
      y: Math.floor(cell / columns) * cellHeight + cellHeight * (0.2 + random() * 0.6),
      vx: 0,
      vy: 0,
    };
  });

  // Relax before the first frame so the field opens already scattered; the
  // integrator alone would take a visible second to untangle a random start.
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    separate(bodies, 0.6, random);
    for (const body of bodies) constrainToField(body, field);
  }

  for (const body of bodies) {
    const angle = random() * Math.PI * 2;
    const speed = START_SPEED_MIN + random() * (START_SPEED_MAX - START_SPEED_MIN);
    body.vx = Math.cos(angle) * speed;
    body.vy = Math.sin(angle) * speed;
  }

  return bodies;
}

/** Exchanges velocity along the contact normal for every touching pair. */
function collide(bodies: BubbleBody[]): void {
  for (let a = 0; a < bodies.length; a += 1) {
    for (let b = a + 1; b < bodies.length; b += 1) {
      const first = bodies[a];
      const second = bodies[b];
      const radiusX = first.hw + second.hw + GAP;
      const radiusY = first.hh + second.hh + GAP;
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      if (Math.hypot(dx / radiusX, dy / radiusY) >= 1) continue;

      // Normal of the pair's ellipse at the contact point.
      let nx = dx / (radiusX * radiusX);
      let ny = dy / (radiusY * radiusY);
      const length = Math.hypot(nx, ny);
      if (length === 0) continue;
      nx /= length;
      ny /= length;

      const approach = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
      if (approach >= 0) continue;
      const impulse = (-(1 + RESTITUTION) * approach) / 2;
      if (!first.frozen) {
        first.vx -= impulse * nx;
        first.vy -= impulse * ny;
      }
      if (!second.frozen) {
        second.vx += impulse * nx;
        second.vy += impulse * ny;
      }
    }
  }
}

/**
 * Advances the field by `seconds`. Mutates the bodies in place.
 *
 * `random` is injected so a test can drive the simulation deterministically —
 * the wander term is the only source of randomness per frame.
 */
export function stepBubbleField(
  bodies: BubbleBody[],
  field: BubbleFieldSize,
  seconds: number,
  random: () => number,
): void {
  const dt = Math.min(Math.max(seconds, 0), MAX_STEP_SECONDS);
  if (dt === 0 || field.width <= 0 || field.height <= 0) return;

  for (const body of bodies) {
    if (body.frozen) continue;
    body.vx += (random() * 2 - 1) * WANDER * dt;
    body.vy += (random() * 2 - 1) * WANDER * dt;
    clampSpeed(body, random);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
  }

  collide(bodies);
  separate(bodies, 0.5, random);
  for (const body of bodies) constrainToField(body, field);
}

/**
 * Shoves everything away from a point — the shockwave a popping bubble leaves
 * behind, and the recoil around a wrong tap.
 */
export function pushBubblesFrom(
  bodies: BubbleBody[],
  origin: { x: number; y: number },
  strength: number,
): void {
  for (const body of bodies) {
    if (body.frozen) continue;
    const dx = body.x - origin.x;
    const dy = body.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;
    // Falls off with distance, so the neighbours react and the far side barely does.
    const falloff = strength / (1 + distance / 120);
    body.vx += (dx / distance) * falloff;
    body.vy += (dy / distance) * falloff;
  }
}

/** Rescales a field's contents after the viewport changes size. */
export function rescaleBubbleField(
  bodies: BubbleBody[],
  previous: BubbleFieldSize,
  next: BubbleFieldSize,
  sizes: readonly BubbleSize[],
): void {
  const scaleX = previous.width > 0 ? next.width / previous.width : 1;
  const scaleY = previous.height > 0 ? next.height / previous.height : 1;
  const byId = new Map(sizes.map((size) => [size.id, size]));
  for (const body of bodies) {
    const size = byId.get(body.id);
    if (size) {
      body.hw = Math.min(size.width, next.width) / 2;
      body.hh = Math.min(size.height, next.height) / 2;
    }
    body.x *= scaleX;
    body.y *= scaleY;
    constrainToField(body, next);
  }
}
