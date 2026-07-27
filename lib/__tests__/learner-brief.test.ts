import { describe, expect, it } from "vitest";
import {
  LEARNER_BRIEF_LIMITS,
  LEARNER_BRIEF_VERSION,
  isLearnerBriefEmpty,
  normalizeLearnerBrief,
  withCoveredTopic,
} from "@/lib/learner-brief";

describe("normalizeLearnerBrief", () => {
  it("drops keys outside the schema", () => {
    // The point of the bounded schema: a model cannot smuggle free text — or
    // anything identifying — into storage by inventing a field for it.
    const brief = normalizeLearnerBrief({
      goals: ["talk to salon clients"],
      notes: "Anna, 39, lives at Dlouhá 12, diabetes",
      preferredRegister: "casual",
    });

    expect(brief).not.toHaveProperty("notes");
    expect(brief.goals).toEqual(["talk to salon clients"]);
    expect(brief.preferredRegister).toBe("casual");
    expect(brief.version).toBe(LEARNER_BRIEF_VERSION);
  });

  it("rejects an unknown register instead of storing it", () => {
    const brief = normalizeLearnerBrief({ preferredRegister: "extremely polite" });
    expect(brief.preferredRegister).toBeUndefined();
  });

  it("trims, dedupes and caps entries", () => {
    const brief = normalizeLearnerBrief({
      goals: [
        "  travel  ",
        "TRAVEL",
        "x".repeat(LEARNER_BRIEF_LIMITS.maxEntryChars + 40),
        ...Array.from({ length: 30 }, (_, index) => `goal-${index}`),
      ],
    });

    expect(brief.goals).toHaveLength(LEARNER_BRIEF_LIMITS.maxEntries);
    expect(brief.goals[0]).toBe("travel");
    expect(brief.goals[1].length).toBe(LEARNER_BRIEF_LIMITS.maxEntryChars);
  });

  it("coerces garbage into a valid empty brief", () => {
    const brief = normalizeLearnerBrief(null);
    expect(isLearnerBriefEmpty(brief)).toBe(true);
    expect(brief.goals).toEqual([]);
  });
});

describe("withCoveredTopic", () => {
  it("records the committed topic even with no previous brief", () => {
    const brief = withCoveredTopic(null, "Salon small talk");
    expect(brief.coveredTopics).toEqual(["Salon small talk"]);
  });

  it("does not duplicate a topic already covered", () => {
    const first = withCoveredTopic(null, "Doctor visit");
    const second = withCoveredTopic(first, "doctor visit");
    expect(second.coveredTopics).toEqual(["Doctor visit"]);
  });

  it("moves a newly covered topic out of missingTopics", () => {
    const previous = normalizeLearnerBrief({ missingTopics: ["Doctor visit", "Banking"] });
    const next = withCoveredTopic(previous, "Doctor visit");

    expect(next.coveredTopics).toContain("Doctor visit");
    expect(next.missingTopics).toEqual(["Banking"]);
  });
});
