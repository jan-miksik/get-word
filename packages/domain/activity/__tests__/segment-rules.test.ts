import { describe, expect, it } from 'vitest';

import { MAX_SEGMENT_MS } from '@/packages/contracts/src/activity';
import { normalizeActivitySegment } from '../segment-rules';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function segment(overrides: Record<string, unknown> = {}) {
  return {
    client_segment_id: 'seg-1',
    session_id: 'session-1',
    surface: 'study',
    started_at: NOW - 60_000,
    ended_at: NOW,
    active_ms: 60_000,
    interactions: 10,
    ...overrides,
  } as Parameters<typeof normalizeActivitySegment>[0];
}

describe('activity segment clamps', () => {
  it('accepts a well-formed segment unchanged', () => {
    const result = normalizeActivitySegment(segment(), NOW);
    expect(result?.activeMs).toBe(60_000);
    expect(result?.surface).toBe('study');
  });

  it('rejects a segment that ends before it starts', () => {
    expect(normalizeActivitySegment(segment({ ended_at: NOW - 120_000 }), NOW)).toBeNull();
  });

  it('rejects a segment dated into the future beyond clock skew', () => {
    const future = normalizeActivitySegment(
      segment({ started_at: NOW + 60 * 60_000, ended_at: NOW + 61 * 60_000 }),
      NOW,
    );
    expect(future).toBeNull();
  });

  it('rejects a segment older than the backdate window', () => {
    const ancient = NOW - 40 * 24 * 60 * 60 * 1000;
    expect(
      normalizeActivitySegment(segment({ started_at: ancient, ended_at: ancient + 60_000 }), NOW),
    ).toBeNull();
  });

  it('clamps active time that exceeds its own span', () => {
    // A modified client claiming an hour of activity inside a one-minute span.
    const result = normalizeActivitySegment(segment({ active_ms: 60 * 60_000 }), NOW);
    expect(result?.activeMs).toBe(60_000);
  });

  it('clamps active time to the maximum segment length', () => {
    const started = NOW - 60 * 60_000;
    const result = normalizeActivitySegment(
      segment({ started_at: started, ended_at: NOW, active_ms: 60 * 60_000 }),
      NOW,
    );
    expect(result?.activeMs).toBe(MAX_SEGMENT_MS);
  });

  it('folds an unrecognised surface to other rather than storing it', () => {
    const result = normalizeActivitySegment(segment({ surface: 'brand_new' }), NOW);
    expect(result?.surface).toBe('other');
  });

  it('rejects segments with no usable identity', () => {
    expect(normalizeActivitySegment(segment({ client_segment_id: '  ' }), NOW)).toBeNull();
    expect(normalizeActivitySegment(segment({ session_id: '' }), NOW)).toBeNull();
  });

  it('rejects negative and non-finite durations', () => {
    expect(normalizeActivitySegment(segment({ active_ms: -5_000 }), NOW)).toBeNull();
    expect(normalizeActivitySegment(segment({ active_ms: Number.NaN }), NOW)).toBeNull();
    expect(normalizeActivitySegment(segment({ started_at: Number.NaN }), NOW)).toBeNull();
  });

  it('drops an invalid source timezone for direct callers', () => {
    expect(normalizeActivitySegment(
      segment({ timezone_at_creation: 'Not/A_Real_Zone' }),
      NOW,
    )?.timezoneAtCreation).toBeNull();
  });
});
