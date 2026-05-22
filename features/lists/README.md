# Lists Feature

## Purpose

Owns list browsing, category editing, translation review, audio generation flow, and list-scoped API access.

## Read First

- `features/lists/types.ts`
- `features/lists/api.ts`
- `features/lists/client/actions.ts`
- `features/lists/hooks/useListWizardItems.ts`
- `features/lists/hooks/useLearningLanguages.ts`
- `app/lists/page.tsx`

## Entrypoints

- UI shell: `app/lists/page.tsx`
- Client API actions: `features/lists/client/actions.ts`
- URL state helpers: `features/lists/client/url-state.ts`
- Local preference storage: `features/lists/client/storage.ts`
- Language helpers: `features/lists/languages.ts`
- Audio-step row/source mapping: `features/lists/audio-step/rows.ts`
- UI steps:
  - `app/lists/PendingForkDialog.tsx`
  - `app/lists/CategoryBrowser.tsx`
  - `app/lists/TextareaEditor.tsx`
  - `app/lists/DiffPreview.tsx`
  - `app/lists/TranslationStep.tsx`
  - `app/lists/AudioStep.tsx`

## Rules

- Canonical list types live in `features/lists/types.ts`.
- Authenticated list HTTP calls go through `features/lists/api.ts`.
- Page-level API mutations should be wrapped in `features/lists/client/actions.ts`.
- Do not reintroduce `apiFetch` helpers inside step components.
