import {
  callOpenRouterChatParsed,
  parseJsonLoose,
  OpenRouterChatError,
  type OpenRouterContentPart,
} from "@/lib/openrouter-chat";
import { getLocalizedLanguageName } from "@/lib/i18n/languages";
import type { PhotoLabLabel } from "@/features/photo-lab/types";
import {
  MAX_LABELS,
  PHOTO_LAB_MAX_TOKENS,
  PHOTO_LAB_MODEL,
} from "./config";

/** A validated label as parsed from the model — ids are assigned by the API route. */
export type ParsedPhotoLabel = Omit<PhotoLabLabel, "id">;

const MAX_LABEL_TEXT_CHARS = 60;

const SYSTEM_PROMPT = [
  "You label objects in photos for a language learner.",
  "Identify clearly visible, distinct objects or parts of objects in the photo.",
  "Skip written text, brand names, and the identity of any person.",
  "Return ONLY a JSON array, no prose.",
].join(" ");

// Full English name + code (e.g. "Czech (cs)") so the model doesn't confuse
// the language or script behind a bare ISO code.
function describeLanguage(code: string): string {
  const name = getLocalizedLanguageName(code, "en");
  return name && name !== code ? `${name} (${code})` : code;
}

function buildUserPrompt(languageFrom: string, languageTo: string): string {
  return [
    `Label up to ${MAX_LABELS} objects in this photo.`,
    "Each array element must be:",
    `{"known": "<object name in ${describeLanguage(languageFrom)}>", "target": "<object name in ${describeLanguage(languageTo)}>", "box_2d": [ymin, xmin, ymax, xmax], "point": [y, x]}`,
    "box_2d and point values are integers 0-1000 relative to the image height and width.",
    '"point" is the exact spot where a small label chip should sit: on the object itself, at its visually most recognizable part.',
    "Use everyday single words or short noun phrases. One label per object.",
    `"known" must be written only in ${describeLanguage(languageFrom)} and "target" only in ${describeLanguage(languageTo)}.`,
  ].join("\n");
}

function asLabelText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LABEL_TEXT_CHARS) return null;
  return trimmed;
}

function clamp01k(value: number): number {
  return Math.min(1000, Math.max(0, value));
}

// Malformed labels are dropped individually — one bad item must never fail or
// retry the whole (paid) vision request.
function parseLabel(raw: unknown): ParsedPhotoLabel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const known = asLabelText(record.known);
  const target = asLabelText(record.target);
  if (!known || !target) return null;

  const box = record.box_2d;
  if (!Array.isArray(box) || box.length !== 4) return null;
  const numbers = box.map((value) => Number(value));
  if (numbers.some((value) => !Number.isFinite(value))) return null;

  const [ymin, xmin, ymax, xmax] = numbers.map(clamp01k);
  if (ymax <= ymin || xmax <= xmin) return null;

  // The chip anchor prefers the model's point (box centers drift off large or
  // irregular objects); a point outside the box is treated as noise.
  let anchorX = (xmin + xmax) / 2;
  let anchorY = (ymin + ymax) / 2;
  const point = record.point;
  if (Array.isArray(point) && point.length === 2) {
    const [py, px] = point.map((value) => Number(value));
    if (
      Number.isFinite(py) &&
      Number.isFinite(px) &&
      py >= ymin &&
      py <= ymax &&
      px >= xmin &&
      px <= xmax
    ) {
      anchorX = px;
      anchorY = py;
    }
  }

  return {
    known,
    target,
    x: anchorX / 1000,
    y: anchorY / 1000,
    w: (xmax - xmin) / 1000,
    h: (ymax - ymin) / 1000,
  };
}

export function parsePhotoLabels(content: string): ParsedPhotoLabel[] {
  const parsed = parseJsonLoose(content);
  const rawLabels = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { labels?: unknown }).labels)
      ? (parsed as { labels: unknown[] }).labels
      : null;

  if (!rawLabels) {
    throw new OpenRouterChatError("Photo analysis returned unparseable JSON.", true);
  }

  const seenTargets = new Set<string>();
  const labels: ParsedPhotoLabel[] = [];
  for (const raw of rawLabels) {
    const label = parseLabel(raw);
    if (!label) continue;
    const targetKey = label.target.toLocaleLowerCase();
    if (seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    labels.push(label);
    if (labels.length >= MAX_LABELS) break;
  }
  // An empty array is a valid answer (nothing recognizable) — not a retry.
  return labels;
}

export async function analyzePhoto(options: {
  apiKey: string;
  imageDataUrl: string;
  languageFrom: string;
  languageTo: string;
}): Promise<ParsedPhotoLabel[]> {
  const userContent: OpenRouterContentPart[] = [
    { type: "text", text: buildUserPrompt(options.languageFrom, options.languageTo) },
    { type: "image_url", image_url: { url: options.imageDataUrl } },
  ];

  return callOpenRouterChatParsed(
    {
      apiKey: options.apiKey,
      model: PHOTO_LAB_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      maxTokens: PHOTO_LAB_MAX_TOKENS,
      temperature: 0.1,
    },
    parsePhotoLabels,
  );
}
