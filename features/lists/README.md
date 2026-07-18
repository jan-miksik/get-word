# Lists Feature

## Purpose

Owns list browsing, category editing, translation review, audio generation flow, and list-scoped API access.

## Read First

- `features/lists/types.ts`
- `features/lists/api.ts`
- `features/lists/client/actions.ts`
- `features/lists/hooks/useListWizardItems.ts`
- `features/shared/languages/useSupportedLanguages.ts`
- `features/lists/hooks/useGoogleUsage.ts`
- `features/lists/hooks/useListsPageData.ts`
- `features/lists/hooks/useListsDetailsData.ts`
- `features/lists/hooks/useListsForking.ts`
- `features/lists/hooks/useListsPageActions.ts`
- `features/lists/components/translation-step/TranslationStep.tsx`
- `app/lists/page.tsx`

## Entrypoints

- UI shell: `app/lists/page.tsx`
- Client API actions: `features/lists/client/actions.ts`
- URL state helpers: `features/lists/client/url-state.ts`
- Local preference storage: `features/lists/client/storage.ts`
- Language helpers: `features/lists/languages.ts`
- Shared language picker/loading/settings-language/types: `features/shared/languages/*`
- Google usage loading: `features/lists/hooks/useGoogleUsage.ts`
- Lists page data/loading/subscriptions: `features/lists/hooks/useListsPageData.ts`
- Lists detail loading/category mutations: `features/lists/hooks/useListsDetailsData.ts`
- Lists fork dialog/state/actions: `features/lists/hooks/useListsForking.ts`
- Lists page select/create/update/edit actions: `features/lists/hooks/useListsPageActions.ts`
- Lists maintenance/category/repair actions: `features/lists/hooks/useListsMaintenanceActions.ts`
- Pending common-list audio marker: `features/lists/hooks/usePendingListAudioMarker.ts`
- Shared lists UI: `features/lists/components/*`
- Translation review shell, row, editors, dialogs, transformations, and provider workflow: `features/lists/components/translation-step/*`
- Category browser metadata and repair workflow: `features/lists/components/category-browser/*`
- Sidebar item and create workflow: `features/lists/components/list-sidebar/*`
- Audio-step shell: `features/lists/audio-step/AudioStep.tsx`
- Audio-step row UI: `features/lists/audio-step/AudioStepRow.tsx`
- Audio-step row/source mapping: `features/lists/audio-step/rows.ts`
- Audio-step generation/regeneration workflow: `features/lists/audio-step/useAudioGenerationWorkflow.ts`
- Audio-step Google TTS voice selection: `features/lists/audio-step/useGoogleTtsVoiceSelection.ts`
- Audio-step reusable audio lookup/linking: `features/lists/audio-step/useReusableAudioLookup.ts`
- UI steps:
  - `features/lists/components/PendingForkDialog.tsx`
  - `features/lists/components/category-browser/CategoryBrowser.tsx`
  - `features/lists/components/TextareaEditor.tsx`
  - `features/lists/components/DiffPreview.tsx`
  - `features/lists/components/translation-step/TranslationStep.tsx`
  - `features/lists/audio-step/AudioStep.tsx`

## Rules

- Canonical list types live in `features/lists/types.ts`.
- `app/lists/page.tsx` is a composition shell; feature UI must not be added under `app/lists`.
- Authenticated list HTTP calls go through `features/lists/api.ts`.
- Page-level API mutations should be wrapped in `features/lists/client/actions.ts`.
- Do not reintroduce `apiFetch` helpers inside step components.
