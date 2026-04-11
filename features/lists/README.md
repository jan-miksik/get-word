# Lists Feature

## Purpose

Owns list browsing, category editing, translation review, audio generation flow, and list-scoped API access.

## Read First

- `features/lists/types.ts`
- `features/lists/api.ts`
- `app/lists/page.tsx`

## Entrypoints

- UI shell: `app/lists/page.tsx`
- UI steps:
  - `app/lists/CategoryBrowser.tsx`
  - `app/lists/TextareaEditor.tsx`
  - `app/lists/DiffPreview.tsx`
  - `app/lists/TranslationStep.tsx`
  - `app/lists/AudioStep.tsx`

## Rules

- Canonical list types live in `features/lists/types.ts`.
- Authenticated list HTTP calls go through `features/lists/api.ts`.
- Do not reintroduce `apiFetch` helpers inside step components.
