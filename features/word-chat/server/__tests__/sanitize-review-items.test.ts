import { describe, expect, it, vi } from "vitest";

// commit.ts reaches for the database and the whole word-chat server stack at
// import time; only the two pure functions below are under test here.
vi.mock("@/lib/db", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { mintAddressFormGroupIds, sanitizeReviewItems } from "../commit";
import type { ReviewItem } from "../../types";

function pair(
  known: string,
  familiar: string,
  polite: string,
  key: string,
): ReviewItem[] {
  return [
    { kind: "word", textKnown: known, textTarget: familiar, addressForm: { form: "familiar" }, variantGroupKey: key },
    { kind: "word", textKnown: known, textTarget: polite, addressForm: { form: "polite" }, variantGroupKey: key },
  ];
}

function plain(known: string, target: string): ReviewItem {
  return { kind: "word", textKnown: known, textTarget: target };
}

describe("sanitizeReviewItems", () => {
  it("keeps both members of a valid pair", () => {
    const result = sanitizeReviewItems(pair("How are you?", "Wie geht es dir?", "Wie geht es Ihnen?", "0:address"));

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.variantGroupKey === "0:address")).toBe(true);
  });

  it("does not treat twins as duplicates: they differ on the target side", () => {
    const result = sanitizeReviewItems(pair("q", "a", "b", "g"));
    expect(result.map((item) => item.textTarget)).toEqual(["a", "b"]);
  });

  it("strips a group key the rows did not earn", () => {
    // Same target on both sides — a forged or stale pair.
    const forged: ReviewItem[] = [
      { kind: "word", textKnown: "q", textTarget: "same", addressForm: { form: "familiar" }, variantGroupKey: "g" },
      { kind: "word", textKnown: "q", textTarget: "same", addressForm: { form: "polite" }, variantGroupKey: "g" },
    ];
    const result = sanitizeReviewItems(forged);

    // Dedupe already collapses the identical pair; whatever survives is not a group.
    expect(result.every((item) => item.variantGroupKey === undefined)).toBe(true);
  });

  it("strips a group key when three rows claim it", () => {
    const rows: ReviewItem[] = [
      ...pair("q", "a", "b", "g"),
      { kind: "word", textKnown: "q", textTarget: "c", addressForm: { form: "polite" }, variantGroupKey: "g" },
    ];
    const result = sanitizeReviewItems(rows);
    expect(result.every((item) => item.variantGroupKey === undefined)).toBe(true);
  });

  it("drops an invalid runtime form and its group claim", () => {
    const forged = [
      {
        kind: "word",
        textKnown: "q",
        textTarget: "a",
        addressForm: { form: "attacker-value" },
        variantGroupKey: "g",
      },
      {
        kind: "word",
        textKnown: "q",
        textTarget: "b",
        addressForm: { form: "familiar" },
        variantGroupKey: "g",
      },
    ] as unknown as ReviewItem[];

    const result = sanitizeReviewItems(forged);

    expect(result[0].addressForm).toBeUndefined();
    expect(result.every((item) => item.variantGroupKey === undefined)).toBe(true);
  });

  it("keeps the form but drops the group when the limit leaves only the primary", () => {
    // The case the pipeline ordering exists for: no persistent pair was created,
    // so the surviving row must not advertise one.
    const result = sanitizeReviewItems(pair("q", "familiar", "polite", "g"), 1);

    expect(result).toHaveLength(1);
    expect(result[0].textTarget).toBe("familiar");
    expect(result[0].addressForm).toEqual({ form: "familiar" });
    expect(result[0].variantGroupKey).toBeUndefined();
  });

  it("drops the group when dedupe removes one twin", () => {
    const rows: ReviewItem[] = [
      plain("q", "polite"),
      ...pair("q", "familiar", "polite", "g"),
    ];
    const result = sanitizeReviewItems(rows);

    // The polite twin is an exact duplicate of the earlier plain row.
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.variantGroupKey === undefined)).toBe(true);
  });

  it("never lets alternatives displace the words that were actually typed", () => {
    const rows: ReviewItem[] = [
      ...pair("q0", "f0", "p0", "0:address"),
      ...pair("q1", "f1", "p1", "1:address"),
      plain("bread", "Brot"),
      plain("water", "Wasser"),
    ];

    const result = sanitizeReviewItems(rows, 3);

    expect(result.map((item) => item.textTarget)).toEqual(["f0", "f1", "Brot"]);
    expect(result.every((item) => item.variantGroupKey === undefined)).toBe(true);
  });

  it("saves nothing when the monthly balance is spent", () => {
    expect(sanitizeReviewItems([plain("a", "b")], 0)).toEqual([]);
  });
});

describe("mintAddressFormGroupIds", () => {
  it("issues one id per surviving group, shared by both members", () => {
    const items = sanitizeReviewItems([
      ...pair("q0", "f0", "p0", "0:address"),
      ...pair("q1", "f1", "p1", "1:address"),
    ]);
    const ids = mintAddressFormGroupIds(items);

    expect(ids.size).toBe(2);
    expect(new Set(ids.values()).size).toBe(2);
  });

  it("issues nothing when no group survived", () => {
    const items = sanitizeReviewItems(pair("q", "f", "p", "g"), 1);
    expect(mintAddressFormGroupIds(items).size).toBe(0);
  });

  it("revalidates the final insert set before issuing an id", () => {
    // Request-level validation may have accepted the pair before database
    // dedupe discovered that one member already exists.
    expect(mintAddressFormGroupIds(pair("q", "f", "p", "g").slice(1)).size).toBe(0);
  });
});
