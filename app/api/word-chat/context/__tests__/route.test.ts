import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveUserFromRequest: vi.fn(),
  updateUsers: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  loadLearnerBrief: vi.fn(),
  getPersonalList: vi.fn(),
  getMonthlyItemUsage: vi.fn(),
  resolveWordChatLanguageContext: vi.fn(),
  getUserLanguageLevel: vi.fn(),
  upsertUserLanguageLevel: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  resolveUserFromRequest: mocks.resolveUserFromRequest,
  canPublishPublicList: (user: { userRole?: string }) => user.userRole === "editor",
  unauthorizedResponse: () =>
    Response.json({ error: "Authentication required" }, { status: 401 }),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    update: mocks.updateUsers,
  },
}));

vi.mock("@/features/word-chat/server/personal-list", () => ({
  loadLearnerBrief: mocks.loadLearnerBrief,
  getPersonalList: mocks.getPersonalList,
}));

vi.mock("@/features/word-chat/server/rate-limit", () => ({
  getMonthlyItemUsage: mocks.getMonthlyItemUsage,
}));

vi.mock("@/features/word-chat/server/config", () => ({
  SELECTABLE_MODELS: [],
  WORD_CHAT_CHAT_MODEL: "chat-model",
  WORD_CHAT_PROPOSAL_MODEL: "proposal-model",
  WORD_CHAT_TRANSLATION_MODEL: "translation-model",
  canSeeWordChatDiagnostics: () => false,
}));

vi.mock("@/features/word-chat/server/language-preferences", () => ({
  resolveWordChatLanguageContext: mocks.resolveWordChatLanguageContext,
  getUserLanguageLevel: mocks.getUserLanguageLevel,
  upsertUserLanguageLevel: mocks.upsertUserLanguageLevel,
}));

import { GET, POST } from "../route";

describe("/api/word-chat/context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveUserFromRequest.mockResolvedValue({
      id: "user-1",
      userRole: "user",
      wordChatAddressRegister: "formal",
      wordChatSalutationGender: "neutral",
    });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateUsers.mockReturnValue({ set: mocks.updateSet });
    mocks.loadLearnerBrief.mockResolvedValue(null);
    mocks.getPersonalList.mockResolvedValue(null);
    mocks.getMonthlyItemUsage.mockResolvedValue({ used: 0, limit: 60 });
    mocks.resolveWordChatLanguageContext.mockResolvedValue({
      languageFrom: "cs",
      languageTo: "vi",
      listId: "list-vi",
    });
    mocks.getUserLanguageLevel.mockResolvedValue("A0");
    mocks.upsertUserLanguageLevel.mockResolvedValue("B1");
  });

  it("derives the target language from the verified list context and treats A0 as complete", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.test/api/word-chat/context?from=cs&to=de&base_list_id=list-vi",
      ),
    );

    expect(mocks.resolveWordChatLanguageContext).toHaveBeenCalledWith({
      userId: "user-1",
      listId: "list-vi",
      languageFrom: "cs",
      languageTo: "de",
    });
    expect(mocks.getUserLanguageLevel).toHaveBeenCalledWith({
      userId: "user-1",
      languageTo: "vi",
    });
    const body = await response.json();
    expect(body.language_level).toBe("A0");
    expect(body.preferences_complete).toEqual({ global: true, language: true });
  });

  it("saves language level for the server-resolved target language, not a client override", async () => {
    const response = await POST(
      new NextRequest("https://example.test/api/word-chat/context", {
        method: "POST",
        body: JSON.stringify({
          language_level: "B1",
          language_from: "cs",
          language_to: "de",
          base_list_id: "list-vi",
        }),
      }),
    );

    expect(mocks.resolveWordChatLanguageContext).toHaveBeenCalledWith({
      userId: "user-1",
      listId: "list-vi",
      languageFrom: "cs",
      languageTo: "de",
    });
    expect(mocks.upsertUserLanguageLevel).toHaveBeenCalledWith({
      userId: "user-1",
      languageTo: "vi",
      languageLevel: "B1",
    });
    const body = await response.json();
    expect(body.language_level).toBe("B1");
    expect(body.preferences_complete.language).toBe(true);
  });

  it("rejects language-level writes without a valid list or onboarding language context", async () => {
    mocks.resolveWordChatLanguageContext.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("https://example.test/api/word-chat/context", {
        method: "POST",
        body: JSON.stringify({
          address_register: "casual",
          language_level: "A2",
          language_to: "not a language",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateUsers).not.toHaveBeenCalled();
    expect(mocks.upsertUserLanguageLevel).not.toHaveBeenCalled();
  });

  it("updates only global salutation fields on the users row", async () => {
    await POST(
      new NextRequest("https://example.test/api/word-chat/context", {
        method: "POST",
        body: JSON.stringify({
          address_register: "casual",
          salutation_gender: "female",
        }),
      }),
    );

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        wordChatAddressRegister: "casual",
        wordChatSalutationGender: "female",
      }),
    );
    expect(mocks.updateSet.mock.calls[0][0]).not.toHaveProperty(
      "wordChatLanguageLevel",
    );
    expect(mocks.upsertUserLanguageLevel).not.toHaveBeenCalled();
  });

  it("returns the existing per-language level when saving only global fields with context", async () => {
    mocks.getUserLanguageLevel.mockResolvedValue("B2");

    const response = await POST(
      new NextRequest("https://example.test/api/word-chat/context", {
        method: "POST",
        body: JSON.stringify({
          address_register: "casual",
          base_list_id: "list-vi",
          language_from: "cs",
          language_to: "de",
        }),
      }),
    );

    expect(mocks.upsertUserLanguageLevel).not.toHaveBeenCalled();
    expect(mocks.getUserLanguageLevel).toHaveBeenCalledWith({
      userId: "user-1",
      languageTo: "vi",
    });
    const body = await response.json();
    expect(body.language_level).toBe("B2");
    expect(body.preferences_complete.language).toBe(true);
  });
});
