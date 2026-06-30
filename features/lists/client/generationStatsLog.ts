// Browser-console logging for how much of a freshly created list reused
// existing content vs. generated new content. Shared by the autogenerate and
// fork onboarding paths so both produce one consistent `[Get Word]` log line.
//
// Counting units (intentional, declared inline via `unit`):
//   - translations are counted per word/item ("generated" = the word needed a
//     translate/LLM call; "reused" = its text was copied wholesale)
//   - audio is counted per clip/side ("reused" = a playable asset already
//     existed so TTS generation was skipped)

export type GenerationStatsLog = {
  flow: 'autogenerate' | 'fork';
  listName: string;
  listId: string;
  // Autogenerate: provider/seedKind (e.g. "seed_copy / exact_pair"). Fork: "fork".
  strategy: string;
  seedListId?: string | null;
  translations: { reused: number; generated: number };
  audio: { reused: number; generated: number; failed?: number; missing?: number };
};

export function logGenerationStats(stats: GenerationStatsLog): void {
  console.log('[Get Word] Generation stats', {
    flow: stats.flow,
    listName: stats.listName,
    listId: stats.listId,
    strategy: stats.strategy,
    seedListId: stats.seedListId,
    translations: {
      unit: 'words',
      reused: stats.translations.reused,
      generated: stats.translations.generated,
    },
    audio: {
      unit: 'clips',
      reused: stats.audio.reused,
      generated: stats.audio.generated,
      failed: stats.audio.failed,
      missing: stats.audio.missing,
    },
  });
}
