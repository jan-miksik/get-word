import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isEditor, resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { OpenRouterChatError } from "@/lib/openrouter-chat";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { analyzePhoto } from "@/features/photo-lab/server/analyze";
import {
  DailyLimitError,
  getPhotoLabUsage,
  releasePhotoLabReservation,
  reservePhotoLabRateLimit,
  type PhotoLabReservation,
} from "@/features/photo-lab/server/rate-limit";
import { MAX_IMAGE_BASE64_CHARS } from "@/features/photo-lab/server/config";

const IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|png|webp);base64,/;
const MAX_REQUEST_BODY_BYTES = MAX_IMAGE_BASE64_CHARS + 20_000;

class RequestBodyTooLargeError extends Error {}

async function readJsonBodyWithLimit(request: NextRequest): Promise<unknown | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

function photoTooLargeResponse() {
  return NextResponse.json(
    { error: "Image is too large.", code: "PHOTO_TOO_LARGE" },
    { status: 413 },
  );
}

function limitReachedResponse(message: string) {
  return NextResponse.json(
    { error: message, code: "PHOTO_LAB_LIMIT_REACHED" },
    { status: 429 },
  );
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  // Reject an exhausted account before the ~2 MB upload is read. The atomic
  // reservation below is still what enforces the limit; this only avoids
  // making an already-refused client wait out the whole body transfer.
  const usage = await getPhotoLabUsage(user.id, isEditor(user), user.photoLabLimitOverride);
  if (usage.remaining <= 0) {
    return limitReachedResponse("Photo analysis limit reached for this account.");
  }

  let body: unknown | null = null;
  try {
    body = await readJsonBodyWithLimit(request);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) return photoTooLargeResponse();
    body = null;
  }
  const { image, language_from, language_to } = (body ?? {}) as {
    image?: string;
    language_from?: string;
    language_to?: string;
  };

  if (typeof image !== "string" || !IMAGE_DATA_URL_RE.test(image)) {
    return NextResponse.json(
      { error: "image must be a base64 data URL (jpeg, png, or webp)" },
      { status: 400 },
    );
  }
  if (image.length > MAX_IMAGE_BASE64_CHARS) {
    return photoTooLargeResponse();
  }

  if (
    typeof language_from !== "string" ||
    typeof language_to !== "string" ||
    !language_from.trim() ||
    !language_to.trim()
  ) {
    return NextResponse.json(
      { error: "language_from and language_to are required" },
      { status: 400 },
    );
  }
  const languageFrom = normalizeLanguageCode(language_from);
  const languageTo = normalizeLanguageCode(language_to);
  if (languageFrom === languageTo) {
    return NextResponse.json(
      { error: "language_from and language_to must differ" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENROUTER_SERVER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Photo analysis is not configured on this server." },
      { status: 500 },
    );
  }

  let reservation: PhotoLabReservation;
  try {
    reservation = await reservePhotoLabRateLimit(
      user.id,
      isEditor(user),
      user.photoLabLimitOverride,
    );
  } catch (err) {
    if (err instanceof DailyLimitError) {
      return limitReachedResponse(err.message);
    }
    throw err;
  }

  try {
    const parsedLabels = await analyzePhoto({
      apiKey,
      imageDataUrl: image,
      languageFrom,
      languageTo,
    });
    const labels = parsedLabels.map((label) => ({ id: randomUUID(), ...label }));
    return NextResponse.json({ labels });
  } catch (err) {
    // Charge the reservation only when we cannot tell whether the provider ran.
    // Any observed failure — an HTTP error, a truncated body, an unparseable
    // payload — produced nothing the user can use, so the reservation goes back.
    // Only a transport failure is genuinely ambiguous. Mirrors the
    // release/unknown split in features/schools/server/translation-requests.
    const isAmbiguous = err instanceof OpenRouterChatError && err.kind === "transport";
    if (!isAmbiguous) {
      await releasePhotoLabReservation(reservation);
    }

    if (err instanceof OpenRouterChatError) {
      console.error("[photo-lab] OpenRouter analysis failed", err);
      if (err.isOutOfCredits) {
        return NextResponse.json(
          {
            error: "The photo analysis service is out of credits.",
            code: "OPENROUTER_OUT_OF_CREDITS",
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: "Photo analysis failed. Please try again." },
        { status: 502 },
      );
    }
    throw err;
  }
}
