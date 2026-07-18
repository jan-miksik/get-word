import { normalizeLanguageCode } from '@/lib/i18n/languages';

/**
 * Hand-off of the language pair a visitor picks on the public landing page.
 * The landing hero saves the choice here; after login, the onboarding screen
 * reads it as the initial pair so the visitor's first click on the site is
 * already personalized. localStorage survives the OAuth/OTP redirects because
 * the whole flow stays in the same browser.
 *
 * The value is only ever a fallback: an explicitly synced pair (a returning
 * user's `learningLanguageFrom/To`) always wins, so a stale entry is harmless.
 */
const LANDING_PAIR_STORAGE_KEY = 'get-word-landing-pair';

export type LandingLanguagePair = {
  from?: string;
  to?: string;
  wantsOwnList?: boolean;
  // Set once the post-login streamlined auto-setup has committed to this pair, so
  // it only ever kicks off list generation the first time. On a later refresh
  // (before onboarding finishes) a consumed pair no longer re-triggers generation
  // — instead the marketing landing screen reappears, pre-filled, letting the
  // visitor review or change the pair. Cleared whenever a fresh pair is saved.
  consumed?: boolean;
};

export function saveLandingLanguagePair(pair: LandingLanguagePair): void {
  try {
    const value: LandingLanguagePair = {};
    if (pair.from) value.from = normalizeLanguageCode(pair.from);
    if (pair.to) value.to = normalizeLanguageCode(pair.to);
    if (pair.wantsOwnList) value.wantsOwnList = true;
    if (pair.consumed) value.consumed = true;
    localStorage.setItem(LANDING_PAIR_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode) — the visitor just
    // re-picks the pair during onboarding.
  }
}

// Flags the stored pair as already used for auto-setup without disturbing its
// values, so they remain available to pre-fill the landing/onboarding screens on
// a refresh. No-op when there is nothing stored.
export function markLandingLanguagePairConsumed(): void {
  const existing = readLandingLanguagePair();
  if (!existing || existing.consumed) return;
  saveLandingLanguagePair({ ...existing, consumed: true });
}

export function readLandingLanguagePair(): LandingLanguagePair | null {
  try {
    const raw = localStorage.getItem(LANDING_PAIR_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { from, to } = parsed as Record<string, unknown>;
    const wantsOwnList = (parsed as Record<string, unknown>).wantsOwnList;
    const consumed = (parsed as Record<string, unknown>).consumed;
    const pair: LandingLanguagePair = {};
    if (typeof from === 'string' && from) pair.from = normalizeLanguageCode(from);
    if (typeof to === 'string' && to) pair.to = normalizeLanguageCode(to);
    if (typeof wantsOwnList === 'boolean') pair.wantsOwnList = wantsOwnList;
    if (typeof consumed === 'boolean') pair.consumed = consumed;
    return pair.from || pair.to || pair.wantsOwnList !== undefined ? pair : null;
  } catch {
    return null;
  }
}
