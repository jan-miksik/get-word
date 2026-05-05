import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../client', () => ({ db: {} }));

import { getListLanguageCodeVariants } from '../lists';

describe('word list language matching', () => {
  it('treats Czech legacy and current codes as the same list language', () => {
    expect(getListLanguageCodeVariants('cs')).toEqual(['cs', 'cz']);
    expect(getListLanguageCodeVariants('cz')).toEqual(['cs', 'cz']);
    expect(getListLanguageCodeVariants('vi')).toEqual(['vi']);
  });
});
