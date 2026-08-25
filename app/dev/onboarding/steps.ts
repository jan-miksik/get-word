/**
 * The steps the preview can be opened at. Deliberately not in the client
 * preview module: the `[step]` route is a server component and can only import
 * plain values from here, not call across the client boundary.
 */
export const PREVIEW_STEPS = ['language', 'level', 'goal', 'reminder', 'words', 'done'] as const;

export type PreviewStep = (typeof PREVIEW_STEPS)[number];

export function isPreviewStep(value: string): value is PreviewStep {
  return (PREVIEW_STEPS as readonly string[]).includes(value);
}
