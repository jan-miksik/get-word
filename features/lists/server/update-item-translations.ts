import { setItemComment, updateItemTranslations } from "@/lib/db";
import { makeManualComment } from "@/lib/word-item-comment";
import {
  AcceptedAnswersValidationError,
  normalizeAcceptedAnswersForSave,
} from "@/lib/word-item-accepted-answers";

export class UpdateItemTranslationsError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "UpdateItemTranslationsError";
  }
}

type TranslationEntry = {
  id: string;
  text_target?: string | null;
  text_known?: string | null;
  status: "translated" | "manual";
  // Optional manual study-note edit. A string sets/overwrites the manual
  // comment; explicit null clears it. Omitted = leave the comment untouched.
  comment?: string | null;
  // Owner/editor toggle for case-insensitive progress matching on this item.
  ignore_case?: boolean;
  accepted_known?: string[];
  accepted_target?: string[];
};

export async function updateListItemTranslations(body: Record<string, unknown>) {
  const { translations } = body as { translations?: TranslationEntry[] };

  if (!translations || !Array.isArray(translations)) {
    throw new UpdateItemTranslationsError("translations array is required");
  }

  // Filter to entries that have a side update or a comment edit. `text_target:
  // null` is an intentional clear so target text can be regenerated later.
  const valid = translations.filter(
    (t) =>
      t.id &&
      (Object.prototype.hasOwnProperty.call(t, "text_target") ||
        Object.prototype.hasOwnProperty.call(t, "text_known") ||
        Object.prototype.hasOwnProperty.call(t, "comment") ||
        Object.prototype.hasOwnProperty.call(t, "ignore_case") ||
        Object.prototype.hasOwnProperty.call(t, "accepted_known") ||
        Object.prototype.hasOwnProperty.call(t, "accepted_target")),
  );
  const skipped = translations.length - valid.length;
  try {
    for (const t of valid) {
      if (
        (Object.prototype.hasOwnProperty.call(t, "accepted_known") && !Array.isArray(t.accepted_known)) ||
        (Object.prototype.hasOwnProperty.call(t, "accepted_target") && !Array.isArray(t.accepted_target))
      ) {
        throw new UpdateItemTranslationsError(
          "accepted_known and accepted_target must be arrays",
        );
      }
      // Run every throwing accepted-answer validation before any comment or
      // translation mutation. The primary text only affects deduplication, not
      // the validation constraints checked here; the DB layer normalizes again
      // against the actual next primary when it writes.
      if (Object.prototype.hasOwnProperty.call(t, "accepted_known")) {
        normalizeAcceptedAnswersForSave(t.accepted_known, "");
      }
      if (Object.prototype.hasOwnProperty.call(t, "accepted_target")) {
        normalizeAcceptedAnswersForSave(t.accepted_target, "");
      }
    }
  } catch (error) {
    if (error instanceof AcceptedAnswersValidationError) {
      throw new UpdateItemTranslationsError(error.message);
    }
    throw error;
  }

  // Persist manual study-note edits. A string sets/overwrites the manual
  // comment (source:"manual", editedAt now); explicit null clears it.
  const commentEdits = valid.filter((t) =>
    Object.prototype.hasOwnProperty.call(t, "comment"),
  );
  for (const t of commentEdits) {
    const next =
      typeof t.comment === "string" ? makeManualComment(t.comment) : null;
    await setItemComment(t.id, next);
  }

  const fieldEdits = valid.filter(
    (t) =>
      Object.prototype.hasOwnProperty.call(t, "text_target") ||
      Object.prototype.hasOwnProperty.call(t, "text_known") ||
      Object.prototype.hasOwnProperty.call(t, "ignore_case") ||
      Object.prototype.hasOwnProperty.call(t, "accepted_known") ||
      Object.prototype.hasOwnProperty.call(t, "accepted_target"),
  );
  if (fieldEdits.length > 0) {
    try {
      await updateItemTranslations(
        fieldEdits.map((t) => {
        const hasTextEdit =
          Object.prototype.hasOwnProperty.call(t, "text_target") ||
          Object.prototype.hasOwnProperty.call(t, "text_known");
        const update: {
          id: string;
          textTarget?: string | null;
          textKnown?: string;
          translationStatus?: "translated" | "manual";
          ignoreCase?: boolean;
          acceptedKnown?: string[];
          acceptedTarget?: string[];
        } = {
          id: t.id,
          // Only stamp translation status when the text actually changed — an
          // ignore_case-only toggle must not flip a translated item to manual.
          ...(hasTextEdit ? { translationStatus: t.status ?? "manual" } : {}),
        };
        if (Object.prototype.hasOwnProperty.call(t, "text_target")) {
          update.textTarget = t.text_target ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(t, "text_known")) {
          // `text_known` is NOT NULL in the schema; an explicit null is an
          // intentional clear, stored as an empty string for regeneration.
          if (t.text_known === null) {
            update.textKnown = "";
          } else if (t.text_known) {
            update.textKnown = t.text_known;
          }
        }
        if (Object.prototype.hasOwnProperty.call(t, "ignore_case")) {
          update.ignoreCase = Boolean(t.ignore_case);
        }
        if (Object.prototype.hasOwnProperty.call(t, "accepted_known")) {
          update.acceptedKnown = Array.isArray(t.accepted_known) ? t.accepted_known : [];
        }
        if (Object.prototype.hasOwnProperty.call(t, "accepted_target")) {
          update.acceptedTarget = Array.isArray(t.accepted_target) ? t.accepted_target : [];
        }
        return update;
        }),
      );
    } catch (error) {
      if (error instanceof AcceptedAnswersValidationError) {
        throw new UpdateItemTranslationsError(error.message);
      }
      throw error;
    }
  }

  return { updated: valid.length, skipped };
}
