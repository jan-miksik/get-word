import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

// `vi.mock` is hoisted above imports, so the spy has to be created inside the
// factory and pulled back out afterwards.
vi.mock("../server/corpus", async () => {
  const actual = await vi.importActual<typeof import("../server/corpus")>("../server/corpus");
  return { ...actual, loadCorpusItems: vi.fn() };
});

import {
  materializeProposedItems,
  selectPromptCorpusPool,
  selectPromptExclusions,
} from "../server/propose";
import { dedupKey, loadCorpusItems } from "../server/corpus";

const loadCorpusItemsMock = vi.mocked(loadCorpusItems);

function corpusRow(id: string, textKnown: string) {
  return {
    id,
    textKnown,
    textTarget: "translated",
    audioAssetId: "asset-1",
    audioHash: "hash-1",
    knownAudioAssetId: null,
  };
}

function corpusEntry(id: string, text: string, categoryName: string | null = null) {
  return { id, text, categoryName };
}

describe("selectPromptCorpusPool", () => {
  it("puts relevant verified rows first before trimming the prompt pool", () => {
    const selected = selectPromptCorpusPool({
      pool: [
        corpusEntry("general-1", "čas", "Základy"),
        corpusEntry("cafe-1", "účet, prosím", "Kavárna"),
        corpusEntry("doctor-1", "bolí mě hlava", "Lékař"),
        corpusEntry("cafe-2", "kávu s mlékem", "Kavárna"),
      ],
      messages: [{ role: "user", content: "Chci slovíčka do kavárny." }],
      brief: null,
      limit: 2,
    });

    expect(selected.map((entry) => entry.id)).toEqual(["cafe-1", "cafe-2"]);
  });

  it("backfills from curated order when the conversation is vague", () => {
    const selected = selectPromptCorpusPool({
      pool: [
        corpusEntry("first", "dobrý den"),
        corpusEntry("second", "prosím"),
        corpusEntry("third", "děkuji"),
      ],
      messages: [{ role: "user", content: "Jen základy." }],
      brief: null,
      limit: 2,
    });

    expect(selected.map((entry) => entry.id)).toEqual(["first", "second"]);
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
  beforeEach(() => {
    loadCorpusItemsMock.mockReset();
    loadCorpusItemsMock.mockResolvedValue(new Map());
  });

  it("keeps generated items, normalizes whitespace, and defaults confidence", async () => {
    const items = await materializeProposedItems({
      raw: [
        { kind: "sentence", source: "generated", text: "  Kolik   to stojí?  ", confidence: 0.9 },
        { kind: "word", source: "generated", text: "stojí" },
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

  it("maps the prompt's short refs back to real corpus ids", async () => {
    // The prompt lists entries as c1/c2/… because a UUID per line was most of
    // that block's tokens; the model never sees a real id.
    loadCorpusItemsMock.mockResolvedValue(
      new Map([["real-id", corpusRow("real-id", "dobrý den")]]),
    );

    const items = await materializeProposedItems({
      raw: [{ kind: "word", source: "corpus", corpusItemId: "c1", confidence: 0.8 }],
      exclusionKeys: new Set(),
      corpusRefs: new Map([["c1", "real-id"]]),
    });

    expect(loadCorpusItemsMock).toHaveBeenCalledWith(["real-id"]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "corpus", corpusItemId: "real-id" });
  });

  it("promotes generated text that exactly matches a verified corpus row", async () => {
    loadCorpusItemsMock.mockResolvedValue(
      new Map([["common-chtit", corpusRow("common-chtit", "chtít")]]),
    );

    const items = await materializeProposedItems({
      raw: [{ kind: "word", source: "generated", text: "Chtít.", confidence: 0.8 }],
      exclusionKeys: new Set(),
      corpusTextRefs: new Map([[dedupKey("chtít"), "common-chtit"]]),
    });

    expect(loadCorpusItemsMock).toHaveBeenCalledWith(["common-chtit"]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "corpus",
      corpusItemId: "common-chtit",
      verified: true,
      text: "chtít",
    });
  });

  it("drops a ref that was never offered", async () => {
    loadCorpusItemsMock.mockResolvedValue(new Map());

    const items = await materializeProposedItems({
      raw: [{ kind: "word", source: "corpus", corpusItemId: "c99", confidence: 0.8 }],
      exclusionKeys: new Set(),
      corpusRefs: new Map([["c1", "real-id"]]),
    });

    expect(items).toHaveLength(0);
  });

  it("drops corpus items whose id does not resolve, rather than guessing text", async () => {
    loadCorpusItemsMock.mockResolvedValue(new Map([["real-id", corpusRow("real-id", "dobrý den")]]));

    const items = await materializeProposedItems({
      raw: [
        { kind: "word", source: "corpus", corpusItemId: "real-id", confidence: 0.8 },
        // Hallucinated / deleted id: the model meant something specific and we
        // have no idea what, so there is nothing safe to fall back to.
        { kind: "word", source: "corpus", corpusItemId: "ghost-id", text: "made up", confidence: 0.8 },
      ],
      exclusionKeys: new Set(),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "corpus",
      corpusItemId: "real-id",
      verified: true,
      text: "dobrý den",
    });
  });

  it("re-applies the exclusion list server-side, case-insensitively", async () => {
    // The prompt tells the model not to repeat these. That is a hint, not a
    // guarantee — this is the guarantee.
    const items = await materializeProposedItems({
      raw: [
        { kind: "word", source: "generated", text: "Dobrý den", confidence: 0.9 },
        { kind: "word", source: "generated", text: "na shledanou", confidence: 0.9 },
      ],
      exclusionKeys: new Set([dedupKey("dobrý den")]),
    });

    expect(items.map((item) => item.text)).toEqual(["na shledanou"]);
  });

  it("drops duplicates within one proposal", async () => {
    const items = await materializeProposedItems({
      raw: [
        { kind: "word", source: "generated", text: "kavárna", confidence: 0.9 },
        { kind: "word", source: "generated", text: "Kavárna.", confidence: 0.8 },
      ],
      exclusionKeys: new Set(),
    });

    expect(items).toHaveLength(1);
  });

  it("clamps to the requested maximum", async () => {
    const raw = Array.from({ length: 40 }, (_, index) => ({
      kind: "word" as const,
      source: "generated" as const,
      text: `slovo-${index}`,
      confidence: 0.5,
    }));

    const items = await materializeProposedItems({
      raw,
      exclusionKeys: new Set(),
      maxItems: 14,
    });

    expect(items).toHaveLength(14);
  });

  it("clamps confidence into 0..1", async () => {
    const items = await materializeProposedItems({
      raw: [
        { kind: "word", source: "generated", text: "a", confidence: 5 },
        { kind: "word", source: "generated", text: "b", confidence: -2 },
      ],
      exclusionKeys: new Set(),
    });

    expect(items.map((item) => item.confidence)).toEqual([1, 0]);
  });
});
