// Audio generation flow used by the "autogenerate common list" onboarding
// path. Splits the long Google-TTS batch loop, quota probing, and
// notice/messaging helpers out of `LearningLanguageOnboarding.tsx`
// so the component stays focused on UI and choice orchestration.

import type {
  GoogleUsageResponse,
  WordList,
  WordListItem,
} from '@/features/lists/types';
import {
  getDefaultVoiceSelectionForVoices,
  resolveVoiceForText,
} from '@/features/lists/audio-step/voiceMix';
import {
  getBaseLanguage,
  type TtsLanguageOption,
} from '@/features/lists/audio-step/language';
import type { I18nKey } from '@/lib/i18n/messages';
import { estimateCommonListGenerationSeconds } from './listRecommendations';

const AUTOGENERATE_AUDIO_QUOTA_NOTICE =
  'Audio for this list needs {requested} Google TTS characters, but this account has {remaining} free characters left this month. I generated as much as the free quota allows, so only part of the list may have audio. Contact our tech support and we can help finish it or raise the limit.';
const AUDIO_REPAIR_INSTRUCTIONS =
  'Or you can try to fix it by yourself, click on category in the list, that should open overview of the words in the list, then click on Edit words and check what step has failures or missing parts. It will be most likely Audio. You can just generate the missing parts and confirm that in the last step.';
// Kept small so each request stays well under the serverless timeout now that
// Google TTS is rate-paced server-side (a 200-clip batch could exceed a minute).
const AUDIO_BATCH_SIZE = 50;

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

export type GenerationStatus = {
  title: string;
  detail: string;
  estimateSeconds?: number;
  note?: string;
  progress?: {
    value?: number;
    label?: string;
  };
};

export type AudioGenerationSummary = {
  notice: string | null;
  requestedUnits: number;
  remainingUnits: number | null;
  generatedCount: number;
  failedCount: number;
  failedTargetCount: number;
  failedKnownCount: number;
};

export function countTextUnits(texts: string[]) {
  return texts.reduce((total, text) => total + Array.from(text).length, 0);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

export function getCommonListFailureNotice(message: string) {
  const trimmed = message.trim() || 'Could not autogenerate list';
  const punctuation = /[.!?]$/.test(trimmed) ? '' : '.';
  // The actionable "contact support / open editor" links are rendered as JSX
  // next to this message on the onboarding screen.
  return `${trimmed}${punctuation}`;
}

export function getCommonListAudioFailureNotice(summary: AudioGenerationSummary) {
  const failed = formatNumber(summary.failedCount);
  const total = formatNumber(summary.generatedCount + summary.failedCount);
  const base = `The common list was created, but audio generation failed for ${failed} of ${total} clips.`;
  const detail = summary.notice ? ` ${summary.notice}` : '';
  return `${base}${detail} ${AUDIO_REPAIR_INSTRUCTIONS}`;
}

async function loadTtsLanguageOptions(): Promise<TtsLanguageOption[]> {
  try {
    const res = await fetch('/api/languages');
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.languages) ? data.languages : [];
  } catch {
    return [];
  }
}

function findTtsVoicesForLanguage(
  languages: TtsLanguageOption[],
  languageCode: string,
) {
  const normalized = languageCode.toLowerCase();
  const base = getBaseLanguage(languageCode);
  const exact = languages.find((language) => language.code.toLowerCase() === normalized);
  const matched = exact ?? languages.find((language) => getBaseLanguage(language.code) === base);
  return Array.from(new Set(matched?.ttsVoices ?? []));
}

async function createVoiceResolverForLanguage(
  languagesPromise: Promise<TtsLanguageOption[]>,
  languageCode: string,
) {
  const languages = await languagesPromise;
  const voiceOptions = findTtsVoicesForLanguage(languages, languageCode);
  const selection = getDefaultVoiceSelectionForVoices(voiceOptions);
  return (text: string) => resolveVoiceForText(text, selection, voiceOptions);
}

function getAudioQuotaNotice(requested: number, remaining: number) {
  return AUTOGENERATE_AUDIO_QUOTA_NOTICE
    .replace('{requested}', formatNumber(requested))
    .replace('{remaining}', formatNumber(remaining));
}

function getResponseField(data: Record<string, unknown>, key: string, nestedKey: string) {
  const value = data[key];
  if (!value || typeof value !== 'object' || !(nestedKey in value)) return null;
  const nestedValue = (value as Record<string, unknown>)[nestedKey];
  return typeof nestedValue === 'string' ? nestedValue : null;
}

function hasPlayableAudioUrl(url: string | null | undefined, urls: string[] | undefined) {
  return Boolean(url) || (Array.isArray(urls) && urls.some(Boolean));
}

async function loadTtsRemainingQuota(): Promise<number | null> {
  try {
    const usageRes = await fetch('/api/google-usage');
    if (!usageRes.ok) return null;
    const usageData: GoogleUsageResponse = await usageRes.json();
    const ttsUsage = usageData.account.find((scope) => scope.scope === 'tts');
    if (!ttsUsage) return null;
    return Math.max(0, ttsUsage.account_limit - ttsUsage.used_units);
  } catch {
    return null;
  }
}

export async function generateCommonListAudio({
  list,
  setGenerationStatus,
  t,
}: {
  list: WordList;
  setGenerationStatus: (status: GenerationStatus) => void;
  t: Translate;
}): Promise<AudioGenerationSummary> {
  const audioFailureNotice =
    'The common list is ready, but audio generation could not finish. Audio can be added from the lists editor later.';

  const detailsRes = await fetch(`/api/lists/${list.id}`);
  if (!detailsRes.ok) {
    return {
      notice: audioFailureNotice,
      requestedUnits: 0,
      remainingUnits: null,
      generatedCount: 0,
      failedCount: 0,
      failedTargetCount: 0,
      failedKnownCount: 0,
    };
  }

  const details = await detailsRes.json().catch(() => ({}));
  const items: WordListItem[] = Array.isArray(details.items) ? details.items : [];
  const targetItems = items.filter(
    (item) =>
      item.textTarget &&
      (item.audioStatus !== 'ready' ||
        !hasPlayableAudioUrl(item.audioUrl, item.audioArweaveUrls)),
  );
  const knownItems = items.filter(
    (item) =>
      item.textKnown &&
      (item.knownAudioStatus !== 'ready' ||
        !hasPlayableAudioUrl(item.knownAudioUrl, item.knownAudioArweaveUrls)),
  );
  const audioClipCount = targetItems.length + knownItems.length;
  const requestedUnits = countTextUnits([
    ...targetItems.map((item) => item.textTarget ?? ''),
    ...knownItems.map((item) => item.textKnown),
  ]);
  const remainingUnits = await loadTtsRemainingQuota();
  let quotaNotice =
    remainingUnits !== null && requestedUnits > remainingUnits
      ? getAudioQuotaNotice(requestedUnits, remainingUnits)
      : null;
  let generatedCount = 0;
  let failedCount = 0;
  let failedTargetCount = 0;
  let failedKnownCount = 0;
  const languagesPromise = loadTtsLanguageOptions();
  const voiceResolvers = new Map<string, Promise<(text: string) => string | undefined>>();

  function getVoiceResolver(languageCode: string) {
    const key = languageCode.toLowerCase();
    let resolver = voiceResolvers.get(key);
    if (!resolver) {
      resolver = createVoiceResolverForLanguage(languagesPromise, languageCode);
      voiceResolvers.set(key, resolver);
    }
    return resolver;
  }

  // The list is already created by the time audio runs, so the estimate should
  // reflect only the audio work still left. Scaling by the remaining clip
  // fraction lets the countdown shrink as batches complete instead of showing a
  // fixed total the whole time.
  function estimateRemainingAudioSeconds(remainingClips: number) {
    const remainingFraction = audioClipCount > 0 ? remainingClips / audioClipCount : 0;
    return estimateCommonListGenerationSeconds({
      itemCount: 0,
      audioCharacterCount: Math.round(requestedUnits * remainingFraction),
      audioClipCount: remainingClips,
    });
  }

  setGenerationStatus({
    title: t('onboarding.statusGeneratingAudio'),
    detail:
      audioClipCount > 0
        ? t('onboarding.commonListAudioInitialDetail', { count: formatNumber(items.length) })
        : t('onboarding.commonListNoMissingAudio'),
    estimateSeconds: estimateRemainingAudioSeconds(audioClipCount),
    note: audioClipCount > 0
      ? t('onboarding.commonListAudioKeepOpenNote')
      : undefined,
    progress: audioClipCount > 0
      ? {
          value: 0,
          label: t('onboarding.commonListAudioProgressLabel', {
            done: 0,
            total: formatNumber(audioClipCount),
          }),
        }
      : undefined,
  });
  let processedClipCount = 0;

  function reportAudioProgress() {
    setGenerationStatus({
      title: t('onboarding.statusGeneratingAudio'),
      detail: t('onboarding.commonListAudioProgressDetail', {
        done: formatNumber(processedClipCount),
        total: formatNumber(audioClipCount),
      }),
      estimateSeconds: estimateRemainingAudioSeconds(
        Math.max(0, audioClipCount - processedClipCount),
      ),
      note: t('onboarding.commonListAudioKeepOpenNote'),
      progress: {
        value: audioClipCount > 0 ? processedClipCount / audioClipCount : 1,
        label: t('onboarding.commonListAudioProgressLabel', {
          done: formatNumber(processedClipCount),
          total: formatNumber(audioClipCount),
        }),
      },
    });
  }

  async function generateBatch(
    batchItems: WordListItem[],
    audioField: 'target' | 'known',
    language: string,
  ) {
    if (batchItems.length === 0) return;
    const resolveVoice = await getVoiceResolver(language);
    for (let i = 0; i < batchItems.length; i += AUDIO_BATCH_SIZE) {
      const chunk = batchItems.slice(i, i + AUDIO_BATCH_SIZE);
      let data: Record<string, unknown> = {};
      let res: Response;
      try {
        res = await fetch('/api/audio/generate/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'google_tts',
            allow_partial: true,
            audio_field: audioField,
            items: chunk.map((item) => {
              const text = audioField === 'known' ? item.textKnown : item.textTarget ?? '';
              const voiceId = resolveVoice(text);
              return {
                id: item.id,
                text,
                language,
                ...(voiceId ? { voice_id: voiceId } : {}),
              };
            }),
          }),
        });
        data = await res.json().catch(() => ({}));
      } catch {
        failedCount += chunk.length;
        if (audioField === 'target') failedTargetCount += chunk.length;
        else failedKnownCount += chunk.length;
        quotaNotice ??= audioFailureNotice;
        processedClipCount += chunk.length;
        reportAudioProgress();
        continue;
      }
      const quotaLimitMessage = getResponseField(data, 'quota_limit', 'message');
      const quotaWarningDetail = getResponseField(data, 'quota_warning', 'detail');
      if (!quotaNotice && quotaLimitMessage) {
        quotaNotice = quotaLimitMessage;
      }
      if (!quotaNotice && quotaWarningDetail) {
        quotaNotice =
          'Audio generation could not verify the free quota, so only existing reusable audio may be available. Contact our tech support and we can help finish it.';
      }
      const results = Array.isArray(data?.results) ? data.results : [];
      generatedCount += typeof data?.generated_count === 'number'
        ? (data.generated_count as number)
        : results.filter((result: { status?: string }) => result.status === 'ok').length;
      const batchFailedCount = results.filter(
        (result: { status?: string }) => result.status === 'error',
      ).length;
      failedCount += batchFailedCount;
      if (audioField === 'target') failedTargetCount += batchFailedCount;
      else failedKnownCount += batchFailedCount;
      if (!res.ok && res.status !== 429) {
        quotaNotice ??= typeof data.error === 'string' ? data.error : audioFailureNotice;
      }
      if (!res.ok && res.status === 429 && !quotaNotice) {
        quotaNotice =
          typeof data.error === 'string' ? data.error : getAudioQuotaNotice(requestedUnits, 0);
      }
      processedClipCount += chunk.length;
      reportAudioProgress();
    }
  }

  await generateBatch(targetItems, 'target', list.languageTo);
  await generateBatch(knownItems, 'known', list.languageFrom);
  if (!quotaNotice && generatedCount === 0 && failedCount > 0) {
    quotaNotice =
      'Audio generation could not finish for this list. Contact our tech support and we can help finish it.';
  }
  return {
    notice: quotaNotice,
    requestedUnits,
    remainingUnits,
    generatedCount,
    failedCount,
    failedTargetCount,
    failedKnownCount,
  };
}
