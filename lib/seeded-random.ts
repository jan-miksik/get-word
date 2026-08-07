/**
 * A small deterministic PRNG, shared by the background endpoints.
 *
 * Both `/api/backgrounds/get-word` and `/api/backgrounds/topo` serve an SVG
 * that is randomised per request unless the caller pins it with `?seed=`, and a
 * pinned seed has to produce byte-identical output so the response can be
 * cached as immutable.
 */

function seedToUint32(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 over an FNV-1a hash of the seed string. */
export function createSeededRandom(seed: string): () => number {
  let state = seedToUint32(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
