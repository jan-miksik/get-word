import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The outbox is durable across sessions and devices, so a preference op can
 * reach the server long after it was created — from a phone that was offline,
 * or from a tab restored days later. Arrival order therefore says nothing about
 * what the learner most recently chose. These cover the arbitration that keeps
 * such a replay from reviving a language the learner has since changed.
 */

const mockSelectWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateReturning = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => mockSelectWhere() }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        mockUpdateSet(values);
        return {
          where: () => ({ returning: () => mockUpdateReturning() }),
        };
      },
    }),
  },
}));

const { updateUserPreferences } = await import("../queries/users");

// Relative to now: a choice time is clamped to the present, so a fixed future
// date would be silently pulled back and stop being "later".
const CHOSE_LATER = new Date(Date.now() - 60 * 60 * 1000);
const CHOSE_EARLIER = new Date(Date.now() - 24 * 60 * 60 * 1000);
const CHOSE_LATEST = new Date(Date.now() - 60 * 1000);

function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    settingsLanguage: "cs",
    settingsLanguageSelectedAt: CHOSE_LATER,
    languageFrom: "cs",
    languageTo: "vi",
    onboardingCompletedAt: CHOSE_LATER,
    settingsLanguageRevision: 4,
    languagePairRevision: 7,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectWhere.mockResolvedValue([storedUser()]);
  mockUpdateReturning.mockResolvedValue([storedUser()]);
});

describe("updateUserPreferences language arbitration", () => {
  it("ignores a settings_language chosen before the stored one", async () => {
    await updateUserPreferences("user-1", {
      settings_language: "en",
      settings_language_selected_at: CHOSE_EARLIER.getTime(),
    });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("applies a settings_language chosen after the stored one, stamped with the choice time", async () => {
    const chosenAt = CHOSE_LATEST;
    await updateUserPreferences("user-1", {
      settings_language: "en",
      settings_language_selected_at: chosenAt.getTime(),
    });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsLanguage: "en",
        settingsLanguageSelectedAt: chosenAt,
      })
    );
  });

  it("still applies when the client sends no choice time, keeping old clients working", async () => {
    await updateUserPreferences("user-1", { settings_language: "en" });

    expect(mockSelectWhere).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ settingsLanguage: "en" })
    );
  });

  it("ignores a whole language pair chosen before the stored one", async () => {
    await updateUserPreferences("user-1", {
      language_from: "en",
      language_to: "de",
      onboarding_completed: true,
      language_pair_selected_at: CHOSE_EARLIER.getTime(),
    });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("applies a newer language pair as one decision", async () => {
    const chosenAt = CHOSE_LATEST;
    await updateUserPreferences("user-1", {
      language_from: "en",
      language_to: "de",
      onboarding_completed: true,
      language_pair_selected_at: chosenAt.getTime(),
    });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        languageFrom: "en",
        languageTo: "de",
        onboardingCompletedAt: chosenAt,
      })
    );
  });

  it("keeps a stale pair from blocking the other preferences in the same batch", async () => {
    await updateUserPreferences("user-1", {
      language_from: "en",
      language_to: "de",
      language_pair_selected_at: CHOSE_EARLIER.getTime(),
      game_score: 42,
    });

    const values = mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values.gameScore).toBe(42);
    expect(values).not.toHaveProperty("languageFrom");
    expect(values).not.toHaveProperty("languageTo");
  });

  it("does not let a device clock running ahead park a choice in the future", async () => {
    mockSelectWhere.mockResolvedValue([
      storedUser({ settingsLanguageSelectedAt: null }),
    ]);
    const before = Date.now();

    await updateUserPreferences("user-1", {
      settings_language: "en",
      settings_language_selected_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const values = mockUpdateSet.mock.calls[0]?.[0] as {
      settingsLanguageSelectedAt: Date;
    };
    expect(values.settingsLanguageSelectedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(values.settingsLanguageSelectedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("uses a matching server revision even when the client clock is far behind", async () => {
    await updateUserPreferences("user-1", {
      settings_language: "en",
      settings_language_selected_at: CHOSE_EARLIER.getTime(),
      settings_language_base_revision: 4,
    });

    expect(mockSelectWhere).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ settingsLanguage: "en" }),
    );
  });

  it("returns an explicit conflict when the atomic revision predicate matches no row", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(updateUserPreferences("user-1", {
      language_from: "en",
      language_to: "de",
      language_pair_base_revision: 6,
    })).rejects.toEqual(expect.objectContaining({
      name: "SyncRevisionConflictError",
      domain: "language_pair",
    }));
  });

  // Without a revision predicate the `where` is the user id alone, so an empty
  // result means the row is gone — an account deleted while a sync was in
  // flight — not a stale revision. Calling that a conflict sent the client a
  // 409, which blocks every operation in the batch; progress and review writes
  // have no rebase path out of that state, only discard.
  it("returns null rather than a conflict when no revision was checked", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(
      updateUserPreferences("user-1", { show_english: true }),
    ).resolves.toBeNull();
  });

  it("still reports a conflict for the domain whose revision was checked", async () => {
    mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(updateUserPreferences("user-1", {
      settings_language: "en",
      settings_language_base_revision: 2,
    })).rejects.toEqual(expect.objectContaining({
      name: "SyncRevisionConflictError",
      domain: "settings_language",
    }));
  });
});
