import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('GET /api/backgrounds/get-word', () => {
  it('returns a cacheable SVG for an explicit seed', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/backgrounds/get-word?seed=test-seed')
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(body).toContain('<svg');
    expect(body).toContain('id="pattern31"');
  });

  it('is deterministic for the same seed', async () => {
    const first = await GET(
      new NextRequest('http://localhost/api/backgrounds/get-word?seed=stable')
    );
    const second = await GET(
      new NextRequest('http://localhost/api/backgrounds/get-word?seed=stable')
    );

    expect(await first.text()).toBe(await second.text());
  });

  it('varies the frame transform for different seeds', async () => {
    const first = await GET(
      new NextRequest('http://localhost/api/backgrounds/get-word?seed=first-load')
    );
    const second = await GET(
      new NextRequest('http://localhost/api/backgrounds/get-word?seed=second-load')
    );

    expect(await first.text()).not.toBe(await second.text());
  });

  it('renders the existing frame pattern in development blue outside production', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/backgrounds/get-word?seed=blue-frame')
    );
    const body = await response.text();

    expect(body).toMatch(/style="fill:#1E6FA8"[\s\S]*id="Snowflakes"/);
    expect(body).toMatch(/id="path48316"[\s\S]*style="fill:#1E6FA8;/);
  });

  it('keeps the default frame color on the production hostname', async () => {
    const response = await GET(
      new NextRequest('https://getword.app/api/backgrounds/get-word?seed=prod-frame')
    );
    const body = await response.text();

    expect(body).toMatch(/style="fill:#000000"[\s\S]*id="Snowflakes"/);
  });

  it('randomizes no-seed requests without caching them', async () => {
    const first = await GET(new NextRequest('http://localhost/api/backgrounds/get-word'));
    const second = await GET(new NextRequest('http://localhost/api/backgrounds/get-word'));

    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(second.headers.get('Cache-Control')).toBe('no-store');
    expect(await first.text()).not.toBe(await second.text());
  });
});
