import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  MAX_SAVE_ITEMS,
  MAX_SAVE_TEXT_CHARS,
  sanitizePhotoLabSaveItems,
} from "../save-to-list";

describe("sanitizePhotoLabSaveItems", () => {
  it("drops rows missing either side", () => {
    const result = sanitizePhotoLabSaveItems([
      { known: "okno", target: "cửa sổ" },
      { known: "", target: "bàn" },
      { known: "židle", target: "   " },
    ]);

    expect(result.map((item) => item.known)).toEqual(["okno"]);
  });

  it("collapses whitespace and drops case-insensitive repeats of the same pair", () => {
    const result = sanitizePhotoLabSaveItems([
      { known: "Okno  ", target: "cửa   sổ" },
      { known: "okno", target: "Cửa sổ" },
      { known: "dveře", target: "cửa" },
    ]);

    expect(result).toEqual([
      { known: "Okno", target: "cửa sổ", audioHash: null },
      { known: "dveře", target: "cửa", audioHash: null },
    ]);
  });

  it("keeps the audio hash only when it is a non-empty string", () => {
    const result = sanitizePhotoLabSaveItems([
      { known: "a", target: "b", audioHash: "hash-1" },
      { known: "c", target: "d", audioHash: "" },
      { known: "e", target: "f" },
    ]);

    expect(result.map((item) => item.audioHash)).toEqual(["hash-1", null, null]);
  });

  it("truncates over-long text and caps the batch", () => {
    const long = "x".repeat(MAX_SAVE_TEXT_CHARS + 50);
    const [first] = sanitizePhotoLabSaveItems([{ known: long, target: "y" }]);
    expect(first.known).toHaveLength(MAX_SAVE_TEXT_CHARS);

    const many = Array.from({ length: MAX_SAVE_ITEMS + 10 }, (_, index) => ({
      known: `known-${index}`,
      target: `target-${index}`,
    }));
    expect(sanitizePhotoLabSaveItems(many)).toHaveLength(MAX_SAVE_ITEMS);
  });
});
