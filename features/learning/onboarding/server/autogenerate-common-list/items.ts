import { isPlayableAudioAsset } from "@/lib/audio-assets";
import type { MediaAsset, WordListItem } from "@/lib/db/schema";
import { cleanCategory } from "./helpers";
import type { GeneratedCommonItem, PreparedItem, SourceSide } from "./types";

export function toPreparedItems(
  items: GeneratedCommonItem[],
  options: {
    seedItems?: WordListItem[];
    seedSide?: SourceSide;
    seedLanguage?: string;
    languageFrom: string;
    languageTo: string;
    mediaById?: Map<string, MediaAsset>;
    // When provided, the item's category follows the (translated) origin list
    // instead of the per-item category returned by the generator.
    resolveCategoryName?: (seedItem: WordListItem) => string;
  },
): PreparedItem[] {
  return items.map((item) => {
    // Align to the origin item by sourceIndex (not array position): the model
    // may drop or reorder rows, so a positional zip would attach audio/notes/
    // category to the wrong word.
    const seedItem =
      item.sourceIndex != null ? options.seedItems?.[item.sourceIndex] ?? null : null;
    const categoryName = options.resolveCategoryName && seedItem
      ? options.resolveCategoryName(seedItem)
      : cleanCategory(item.category);
    const prepared: PreparedItem = {
      textKnown: item.known,
      textTarget: item.target,
      categoryName,
      canonicalWordId: seedItem?.id ?? null,
      notes: seedItem?.notes ?? null,
      // Variants generated alongside the texts. Seed accepted answers are NOT
      // carried here: translation-base seeds re-generate both texts, so the
      // seed's variants can't be assumed valid for the new pair.
      acceptedKnown: item.acceptedKnown,
      acceptedTarget: item.acceptedTarget,
    };

    if (seedItem && options.seedSide && options.seedLanguage) {
      const copied =
        options.seedSide === "known"
          ? {
              assetId: seedItem.knownAudioAssetId,
              status: seedItem.knownAudioStatus,
            }
          : {
              assetId: seedItem.audioAssetId,
              status: seedItem.audioStatus,
            };
      const asset = copied.assetId ? options.mediaById?.get(copied.assetId) : null;
      if (asset && isPlayableAudioAsset(asset)) {
        if (options.seedLanguage === options.languageFrom) {
          prepared.knownAudioAssetId = copied.assetId;
          prepared.knownAudioStatus = copied.status;
        }
        if (options.seedLanguage === options.languageTo) {
          prepared.audioAssetId = copied.assetId;
          prepared.audioStatus = copied.status;
        }
      }
    }

    return prepared;
  });
}
