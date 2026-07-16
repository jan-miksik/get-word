import { describe, expect, it } from "vitest";
import { parsePhotoLabels } from "@/features/photo-lab/server/analyze";
import { OpenRouterChatError } from "@/lib/openrouter-chat";
import { MAX_LABELS } from "@/features/photo-lab/server/config";

function labelJson(overrides: Record<string, unknown> = {}) {
  return {
    known: "table",
    target: "stůl",
    box_2d: [100, 200, 300, 400],
    ...overrides,
  };
}

describe("parsePhotoLabels", () => {
  it("parses a bare array and converts box_2d to normalized center + size", () => {
    const labels = parsePhotoLabels(JSON.stringify([labelJson()]));
    expect(labels).toHaveLength(1);
    expect(labels[0]).toEqual({
      known: "table",
      target: "stůl",
      x: (200 + 400) / 2000,
      y: (100 + 300) / 2000,
      w: (400 - 200) / 1000,
      h: (300 - 100) / 1000,
    });
  });

  it("accepts a {labels: [...]} wrapper and prose around the JSON", () => {
    const content = `Here you go:\n${JSON.stringify({ labels: [labelJson()] })}`;
    expect(parsePhotoLabels(content)).toHaveLength(1);
  });

  it("throws a retryable error on unparseable content", () => {
    for (const content of ["not json at all", JSON.stringify({ foo: 1 }), "42"]) {
      let caught: unknown;
      try {
        parsePhotoLabels(content);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(OpenRouterChatError);
      expect((caught as OpenRouterChatError).retryable).toBe(true);
    }
  });

  it("returns an empty array for a valid empty result instead of throwing", () => {
    expect(parsePhotoLabels("[]")).toEqual([]);
  });

  it("drops malformed labels individually while keeping valid ones", () => {
    const labels = parsePhotoLabels(
      JSON.stringify([
        labelJson(),
        labelJson({ known: "" }),
        labelJson({ target: 42 }),
        labelJson({ known: "x".repeat(61) }),
        labelJson({ box_2d: [1, 2, 3] }),
        labelJson({ box_2d: [1, 2, "a", 4] }),
        labelJson({ box_2d: [300, 400, 100, 200] }), // inverted box
        "not an object",
        null,
        labelJson({ known: "chair", target: "židle", box_2d: [0, 0, 500, 500] }),
      ]),
    );
    expect(labels.map((label) => label.target)).toEqual(["stůl", "židle"]);
  });

  it("clamps out-of-range coordinates into 0-1000 before converting", () => {
    const labels = parsePhotoLabels(
      JSON.stringify([labelJson({ box_2d: [-100, -50, 1200, 1500] })]),
    );
    expect(labels[0].x).toBe(0.5);
    expect(labels[0].y).toBe(0.5);
    expect(labels[0].w).toBe(1);
    expect(labels[0].h).toBe(1);
  });

  it("drops a box that collapses after clamping", () => {
    expect(
      parsePhotoLabels(JSON.stringify([labelJson({ box_2d: [-200, 100, -100, 300] })])),
    ).toEqual([]);
  });

  it("prefers a valid point inside the box as the chip anchor", () => {
    const labels = parsePhotoLabels(
      JSON.stringify([labelJson({ point: [150, 250] })]),
    );
    expect(labels[0].x).toBe(250 / 1000);
    expect(labels[0].y).toBe(150 / 1000);
    // Size still comes from the box.
    expect(labels[0].w).toBe((400 - 200) / 1000);
    expect(labels[0].h).toBe((300 - 100) / 1000);
  });

  it("falls back to the box center for a missing, malformed, or out-of-box point", () => {
    for (const point of [undefined, [150], [150, "a"], [50, 250], [150, 900]]) {
      const labels = parsePhotoLabels(JSON.stringify([labelJson({ point })]));
      expect(labels[0].x).toBe((200 + 400) / 2000);
      expect(labels[0].y).toBe((100 + 300) / 2000);
    }
  });

  it("dedupes labels by lowercased target", () => {
    const labels = parsePhotoLabels(
      JSON.stringify([labelJson(), labelJson({ target: "STŮL", known: "desk" })]),
    );
    expect(labels).toHaveLength(1);
  });

  it("caps the result at MAX_LABELS", () => {
    const many = Array.from({ length: MAX_LABELS + 10 }, (_, index) =>
      labelJson({ target: `word-${index}` }),
    );
    expect(parsePhotoLabels(JSON.stringify(many))).toHaveLength(MAX_LABELS);
  });
});
