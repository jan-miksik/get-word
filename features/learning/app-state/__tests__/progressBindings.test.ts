import { describe, expect, it } from "vitest";

import { buildProgressBindings, getWordBindingKey } from "../progressBindings";
import type { NormalizedWord } from "@/lib/words";
import type { ProgressData } from "@/lib/sync";

function makeWord(overrides: Partial<NormalizedWord>): NormalizedWord {
  return {
    id: "word-1",
    cz: "laska",
    vi: "tinh yeu",
    en: "",
    category: ["Basic", "word"],
    ...overrides,
  };
}

describe("progressBindings", () => {
  it("normalizes overlapping words to the same binding key", () => {
    const a = makeWord({ cz: "láska", vi: "tình yêu" });
    const b = makeWord({ id: "word-2", cz: "laska", vi: "tinh yeu" });

    expect(getWordBindingKey(a)).toBe(getWordBindingKey(b));
  });

  it("prefers direct progress when the word already has its own record", () => {
    const words = [
      makeWord({ id: "system-item", cz: "láska", vi: "tình yêu" }),
      makeWord({ id: "custom-item", cz: "láska", vi: "tình yêu" }),
    ];
    const progress: Record<string, ProgressData> = {
      "system-item": { stageIndex: 3, knownCount: 1, unknownCount: 0 },
      "custom-item": { stageIndex: 5, knownCount: 2, unknownCount: 0 },
    };

    const bindings = buildProgressBindings(words, progress);

    expect(bindings.get("custom-item")).toBe("custom-item");
    expect(bindings.get("system-item")).toBe("system-item");
  });

  it("reuses progress from an overlapping word when a custom item has no direct record", () => {
    const words = [
      makeWord({ id: "system-item", listId: "default", cz: "láska", vi: "tình yêu" }),
      makeWord({ id: "custom-item", listId: "test-1", cz: "láska", vi: "tình yêu" }),
      makeWord({ id: "other-custom", listId: "test-1", cz: "stůl", vi: "bàn" }),
    ];
    const progress: Record<string, ProgressData> = {
      "system-item": { stageIndex: 4, knownCount: 3, unknownCount: 1 },
    };

    const bindings = buildProgressBindings(words, progress);

    expect(bindings.get("custom-item")).toBe("system-item");
    expect(bindings.has("other-custom")).toBe(false);
  });
});
