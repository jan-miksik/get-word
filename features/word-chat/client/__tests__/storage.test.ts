import { beforeEach, describe, expect, it } from "vitest";
import { loadDraft } from "../storage";

const STORAGE_KEY = "get-word-word-chat-draft:cs:en";

function storedDraft(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 4,
    savedAt: Date.now(),
    sessionId: "session",
    creationKey: "creation",
    step: "select",
    messages: [{ role: "user", content: "Letiště a doprava" }],
    addressRegister: "casual",
    salutationGender: "male",
    languageLevel: "B1",
    listName: "Moje slovíčka",
    categoryName: "Letiště",
    reviewLabel: "Airport travel",
    proposals: [],
    selectedKeys: [],
    customItems: [],
    reviewItems: [],
    isPublic: null,
    ...patch,
  };
}

describe("word-chat draft migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("removes an old B1 draft padded with beginner labels", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        storedDraft({
          proposals: [
            { kind: "sentence", text: "Můj let má zpoždění." },
            { kind: "sentence", text: "Dal bych si kávu s mlékem, prosím." },
            { kind: "sentence", text: "Můžete mi pomoci s kufrem?" },
            ...["let", "zpoždění", "káva", "mléko", "prosím", "pomoc", "kufr"].map(
              (text) => ({ kind: "word", text }),
            ),
          ],
        }),
      ),
    );

    expect(loadDraft("cs", "en")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps compatible v4 work and migrates it to the current version", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        storedDraft({
          languageLevel: "A2",
          proposals: [{ kind: "word", text: "jízdenka" }],
        }),
      ),
    );

    expect(loadDraft("cs", "en")).toMatchObject({
      version: 5,
      languageLevel: "A2",
      proposals: [{ text: "jízdenka" }],
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
