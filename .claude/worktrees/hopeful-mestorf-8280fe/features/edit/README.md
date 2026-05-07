# Edit Feature

## Purpose

Owns editor-specific word mutation and save flows used by `app/edit/page.tsx`.

## Read First

- `features/edit/hooks/useEditableWords.ts`
- `features/edit/hooks/useEditPageState.ts`
- `features/edit/hooks/useEditRenderers.tsx`
- `features/edit/components/EditStudyContent.tsx`
- `features/edit/components/EditHeader.tsx`
- `app/edit/page.tsx`
- `components/EditableWordCard.tsx`

## Notes

- Editor-only persistence lives in `useEditableWords`.
- Editor page stream grouping and editable-card rendering now live under `features/edit`.
- Shared learning concerns like minigame settings and settling-word UI stay under `features/learning`.
- Editor pages reuse `features/learning/hooks/useWordsLoader.ts`, `useWordStream.ts`, and `usePressHandlers.ts` instead of owning parallel copies.
