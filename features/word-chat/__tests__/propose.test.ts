import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  corpusPoolByText,
  materializeProposedItems,
  selectPromptExclusions,
} from "../server/propose";
import { dedupKey, type CorpusEntry } from "../server/corpus";

function corpusEntry(
  id: string,
  text: string,
  options: { verified?: boolean; categoryName?: string | null } = {},
): CorpusEntry {
  return {
    id,
    text,
    categoryName: options.categoryName ?? null,
    verified: options.verified ?? true,
  };
}

describe("dedupKey", () => {
  it("ignores case, whitespace and surrounding punctuation", () => {
    // These are the near-misses that stop a model proposal from matching an
    // item the app already holds.
    expect(dedupKey("Kolik to stojí?")).toBe(dedupKey("kolik to stojí"));
    expect(dedupKey("  Dobrý   den!  ")).toBe(dedupKey("dobrý den"));
    expect(dedupKey("„účet, prosím“")).toBe(dedupKey("účet, prosím"));
  });

  it("does not fold diacritics", () => {
    // `byt` and `být` are different words; a key loose enough to merge them
    // would silently substitute the wrong item.
    expect(dedupKey("být")).not.toBe(dedupKey("byt"));
  });
});

describe("corpusPoolByText", () => {
  it("lets the curated row win when both tiers hold the same text", () => {
    // `loadCorpusPool` orders verified rows first, so first-write-wins is what
    // prefers the reviewed translation.
    const byText = corpusPoolByText([
      corpusEntry("curated", "dobrý den", { verified: true }),
      corpusEntry("public", "Dobrý den!", { verified: false }),
    ]);

    expect(byText.size).toBe(1);
    expect(byText.get(dedupKey("dobrý den"))).toMatchObject({
      id: "curated",
      verified: true,
    });
  });

  it("carries a connected-list match only as a takeover candidate", () => {
    const byText = corpusPoolByText([
      {
        ...corpusEntry("connected", "dobrý den"),
        listId: "base",
        listName: "Starter",
        takeoverEligible: true,
      },
    ]);

    expect(byText.get(dedupKey("dobrý den"))).toMatchObject({
      takeoverCandidate: {
        sourceItemId: "connected",
        sourceListName: "Starter",
      },
    });
  });
});

describe("selectPromptExclusions", () => {
  it("keeps relevant existing items visible but still trims the model prompt", () => {
    const selected = selectPromptExclusions({
      exclusions: ["dobrý den", "bolí mě hlava", "účet, prosím", "děkuji"],
      messages: [{ role: "user", content: "Potřebuju fráze do kavárny, třeba účet." }],
      brief: null,
      limit: 2,
    });

    expect(selected).toEqual(["účet, prosím", "dobrý den"]);
  });
});

describe("materializeProposedItems", () => {
  it("keeps generated items, normalizes whitespace, and defaults confidence", () => {
    const items = materializeProposedItems({
      raw: [
        { kind: "sentence", text: "  Kolik   to stojí?  ", confidence: 0.9 },
        { kind: "word", text: "stojí" },
      ],
      exclusionKeys: new Set(),
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "sentence",
      source: "generated",
      text: "Kolik to stojí?",
      confidence: 0.9,
    });
    // A missing confidence must not become NaN or drop the item.
    expect(items[1].confidence).toBe(0.5);
  });

  it("snaps a proposal onto an existing item and adopts its exact spelling", () => {
    // The saved pair has to be the pair that was translated and voiced, so the
    // stored row's text replaces the model's near-miss.
    const items = materializeProposedItems({
      raw: [{ kind: "word", text: "Chtít.", confidence: 0.8 }],
      exclusionKeys: new Set(),
      corpusTextRefs: corpusPoolByText([corpusEntry("common-chtit", "chtít")]),
    });

    expect(items).toEqual([
      {
        kind: "word",
        confidence: 0.8,
        source: "corpus",
        corpusItemId: "common-chtit",
        verified: true,
        text: "chtít",
      },
    ]);
  });

  it("reuses an unverified public row but records that it is unverified", () => {
    // Reuse is deliberate — a fresh translation would usually land on much the
    // same answer, and a match brings the audio with it — but the tier has to
    // survive to commit or the pair can never be found again.
    const items = materializeProposedItems({
      raw: [{ kind: "word", text: "kavárna", confidence: 0.7 }],
      exclusionKeys: new Set(),
      corpusTextRefs: corpusPoolByText([
        corpusEntry("public-kavarna", "kavárna", { verified: false }),
      ]),
    });

    expect(items[0]).toMatchObject({
      source: "corpus",
      corpusItemId: "public-kavarna",
      verified: false,
    });
  });

  it("leaves text generated when nothing matches", () => {
    const items = materializeProposedItems({
      raw: [{ kind: "sentence", text: "Nemám drobné.", confidence: 0.6 }],
      exclusionKeys: new Set(),
      corpusTextRefs: corpusPoolByText([corpusEntry("other", "dobrý den")]),
    });

    expect(items[0]).toMatchObject({ source: "generated", text: "Nemám drobné." });
    expect(items[0]).not.toHaveProperty("corpusItemId");
  });

  it("re-applies the exclusion list server-side, case-insensitively", () => {
    // The prompt tells the model not to repeat these. That is a hint, not a
    // guarantee — this is the guarantee.
    const items = materializeProposedItems({
      raw: [
        { kind: "word", text: "Dobrý den", confidence: 0.9 },
        { kind: "word", text: "na shledanou", confidence: 0.9 },
      ],
      exclusionKeys: new Set([dedupKey("dobrý den")]),
    });

    expect(items.map((item) => item.text)).toEqual(["na shledanou"]);
  });

  it("excludes an item the learner already studies even when it matched the pool", () => {
    // Matching must not smuggle a duplicate past the exclusion check: the key is
    // recomputed from the row's own spelling, after the swap.
    const items = materializeProposedItems({
      raw: [{ kind: "word", text: "Dobrý den!", confidence: 0.9 }],
      exclusionKeys: new Set([dedupKey("dobrý den")]),
      corpusTextRefs: corpusPoolByText([corpusEntry("common-hello", "dobrý den")]),
    });

    expect(items).toHaveLength(0);
  });

  it("drops duplicates within one proposal", () => {
    const items = materializeProposedItems({
      raw: [
        { kind: "word", text: "kavárna", confidence: 0.9 },
        { kind: "word", text: "Kavárna.", confidence: 0.8 },
      ],
      exclusionKeys: new Set(),
    });

    expect(items).toHaveLength(1);
  });

  it("clamps to the requested maximum", () => {
    const raw = Array.from({ length: 40 }, (_, index) => ({
      kind: "word" as const,
      text: `slovo-${index}`,
      confidence: 0.5,
    }));

    const items = materializeProposedItems({
      raw,
      exclusionKeys: new Set(),
      maxItems: 14,
    });

    expect(items).toHaveLength(14);
  });

  it("clamps confidence into 0..1", () => {
    const items = materializeProposedItems({
      raw: [
        { kind: "word", text: "a", confidence: 5 },
        { kind: "word", text: "b", confidence: -2 },
      ],
      exclusionKeys: new Set(),
    });

    expect(items.map((item) => item.confidence)).toEqual([1, 0]);
  });
});
