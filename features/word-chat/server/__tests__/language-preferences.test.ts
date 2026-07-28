import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { canonicalizeLearningLanguageCode } from "../language-preferences";

describe("canonicalizeLearningLanguageCode", () => {
  it("normalizes supported language codes to the list canonical form", () => {
    expect(canonicalizeLearningLanguageCode("VI")).toBe("vi");
    expect(canonicalizeLearningLanguageCode("cz")).toBe("cs");
    expect(canonicalizeLearningLanguageCode("zh-cn")).toBe("zh-CN");
  });

  it("rejects unsupported or malformed codes instead of creating a fallback preference", () => {
    expect(canonicalizeLearningLanguageCode("not a language")).toBeNull();
    expect(canonicalizeLearningLanguageCode("xx")).toBeNull();
    expect(canonicalizeLearningLanguageCode(null)).toBeNull();
  });
});
