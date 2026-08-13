import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '../route';

describe('GET /api/settings-languages', () => {
  it('returns only languages with a bundle and filters by query', async () => {
    const res = await GET(new NextRequest('http://localhost/api/settings-languages?target=en&q=ger'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.languages).toEqual([]);
  });

  it('filters by native names and folded diacritics', async () => {
    const nativeRes = await GET(new NextRequest('http://localhost/api/settings-languages?target=en&q=%C4%8D'));
    const foldedRes = await GET(new NextRequest('http://localhost/api/settings-languages?target=en&q=cestina'));

    expect((await nativeRes.json()).languages).toEqual([
      { code: 'cs', name: 'Czech', flag: '🇨🇿', source: 'common' },
    ]);
    expect((await foldedRes.json()).languages).toEqual([
      { code: 'cs', name: 'Czech', flag: '🇨🇿', source: 'common' },
    ]);
  });
});
