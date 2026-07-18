import { getPlayableAudioFields, isPlayableAudioAsset } from '@/lib/audio-assets';
import { findMediaVariantsByText, getVariantLookupKey } from '@/lib/db';
import {
  LANDING_DEMO_WORDS,
  getLandingDemoStaticAudioUrl,
  resolveLandingDemoCode,
} from '@/lib/landing-demo-words';

export async function getLandingDemoAudio(language: string) {
  const lang = resolveLandingDemoCode(language);
  if (!lang) return null;

  const words = LANDING_DEMO_WORDS[lang];
  const variantsByKey = await findMediaVariantsByText(
    words.map((word) => ({ text: word.text, language: lang })),
  );
  const results = words.map((word, index) => {
    const variants = variantsByKey.get(getVariantLookupKey(word.text, lang)) ?? [];
    const playable = variants.find(isPlayableAudioAsset);
    const fields = getPlayableAudioFields(playable);
    return {
      text: word.text,
      static_audio_url: getLandingDemoStaticAudioUrl(lang, index),
      audio_url: fields.url,
      arweave_urls: fields.arweaveUrls,
      content_hash: playable?.contentHash ?? null,
      provider: playable?.provider ?? null,
      storage_type: playable?.storageType ?? null,
      storage_provider: playable?.storageProvider ?? null,
      storage_ref: fields.storageRef,
      size_bytes: playable?.sizeBytes ?? null,
      created_at: playable?.createdAt?.toISOString() ?? null,
    };
  });

  return { lang, results };
}
