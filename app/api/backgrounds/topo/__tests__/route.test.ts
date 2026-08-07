import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const request = (query = '') =>
  new NextRequest(`http://localhost/api/backgrounds/topo${query}`);

describe('GET /api/backgrounds/topo', () => {
  it('returns a cacheable SVG for an explicit seed', async () => {
    const response = GET(request('?seed=test-seed'));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(body).toContain('<svg');
    expect(body).toContain('<path');
  });

  it('is deterministic for the same seed', async () => {
    const first = await GET(request('?seed=stable')).text();
    const second = await GET(request('?seed=stable')).text();

    expect(first).toBe(second);
  });

  it('draws a different map for a different seed', async () => {
    const first = await GET(request('?seed=first-load')).text();
    const second = await GET(request('?seed=second-load')).text();

    expect(first).not.toBe(second);
  });

  it('is randomised, and therefore uncacheable, without a seed', async () => {
    const response = GET(request());

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toBe(await GET(request()).text());
  });

  it('draws more contours as the density rises', async () => {
    const countPaths = async (query: string) =>
      (await GET(request(query)).text()).split('<path').length - 1;

    expect(await countPaths('?seed=same&density=1.6')).toBeGreaterThan(
      await countPaths('?seed=same&density=0.4')
    );
  });

  it('falls back to the landing density when the query is nonsense', async () => {
    const fallback = await GET(request('?seed=same&density=not-a-number')).text();

    expect(fallback).toBe(await GET(request('?seed=same&density=0.4')).text());
  });
});
