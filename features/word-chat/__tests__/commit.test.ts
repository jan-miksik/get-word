import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { sanitizeReviewItems } from "../server/commit";
import { MAX_ITEMS_PER_SESSION } from "../server/config";
import type { ReviewItem } from "../types";

function item(textKnown: string, textTarget = "target"): ReviewItem {
  return { kind: "word", textKnown, textTarget };
}

describe("sanitizeReviewItems", () => {
  it("drops rows missing either side", () => {
    const result = sanitizeReviewItems([
      item("dobrý den"),
      { kind: "word", textKnown: "", textTarget: "x" },
      { kind: "word", textKnown: "y", textTarget: "   " },
    ]);

    expect(result.map((row) => row.textKnown)).toEqual(["dobrý den"]);
  });

  it("collapses whitespace and drops case-insensitive duplicates", () => {
    const result = sanitizeReviewItems([
      item("Kolik   to  stojí?"),
      item("kolik to stojí?"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].textKnown).toBe("Kolik to stojí?");
  });

  it("enforces the per-session cap", () => {
    const many = Array.from({ length: MAX_ITEMS_PER_SESSION + 12 }, (_, index) =>
      item(`slovo-${index}`),
    );

    expect(sanitizeReviewItems(many)).toHaveLength(MAX_ITEMS_PER_SESSION);
  });

  it("preserves audio asset references so commit can attach them", () => {
    const result = sanitizeReviewItems([
      {
        kind: "sentence",
        textKnown: "dobrý den",
        textTarget: "xin chào",
        audioAssetId: "asset-a",
        knownAudioAssetId: "asset-b",
        corpusItemId: "corpus-1",
      },
    ]);

    expect(result[0]).toMatchObject({
      audioAssetId: "asset-a",
      knownAudioAssetId: "asset-b",
      corpusItemId: "corpus-1",
    });
  });
});
