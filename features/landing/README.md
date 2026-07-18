# Landing Feature

Owns the signed-out marketing page and its interactive learning demo.

## Entry Points

- `app/page.tsx` chooses the landing page for visitors without an app session.
- `features/landing/components/LandingPage.tsx` composes the hero, language pair,
  demo, and static sections.
- `features/landing/client/useLandingLanguage.ts` owns the public UI-language
  external store and the existing `get-word-landing-lang` key.
- `features/landing/server/getDemoAudio.ts` assembles the public demo-audio payload;
  `app/api/audio/demo/route.ts` is only its HTTP/cache shell.

## Shared Boundaries

- `features/shared/languages/landingPairStorage.ts` is the neutral pre-login →
  onboarding hand-off because both landing and learning consume the same value.
- `lib/landing-demo-word-data.ts` is generated data. Keep it intact even though it
  is large; regenerate it through `pnpm demo:generate-words`.
- `lib/landing-demo-words.ts` and `lib/landing-demo-types.ts` are neutral domain
  helpers shared by the client demo, server audio lookup, and operator scripts.

Do not put landing-only UI back into global `components/*`.
