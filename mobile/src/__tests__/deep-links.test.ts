import { describe, expect, it } from 'vitest';
import { routeForAppUrl } from '../deep-links';

describe('routeForAppUrl', () => {
  it('accepts an HTTPS Get Word share link', () => {
    expect(routeForAppUrl('https://getword.app/join/share-token')).toBe('/join/share-token');
  });

  it('normalizes an encoded token and ignores untrusted query input', () => {
    expect(routeForAppUrl('https://www.getword.app/join/a%20b?auto=1&next=https://evil.test'))
      .toBe('/join/a%20b');
  });

  it.each([
    'http://getword.app/join/token',
    'https://evil.test/join/token',
    'https://getword.app/privacy',
    'https://getword.app/join/',
    'not a url',
  ])('rejects unsupported URL %s', (url) => {
    expect(routeForAppUrl(url)).toBeNull();
  });
});
