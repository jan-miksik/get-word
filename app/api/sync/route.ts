import { NextRequest, NextResponse } from "next/server";
import { getUserSurveyResponses, touchUserDevice } from "@/lib/db";
import { withSessionCookie } from "@/features/shared/routes/session";
import { createRouteTimer } from "@/features/shared/routes/timing";
import {
  databaseUnavailableResponse,
  isTransientDatabaseError,
  withRetryOnRecoverableDatabaseError,
} from "@/features/shared/routes/database-retry";
import { buildSyncAckPayload } from "@/features/shared/sync/response";
import { parseSinceCursor } from "@/features/shared/sync/cursor";
import type { SyncRequest } from "@/features/sync/types";
import { applySyncMutations } from "@/features/sync/server/apply-mutations";
import { readSyncPayload } from "@/features/sync/server/read-payload";
import { resolveSyncUser } from "@/features/sync/server/resolve-user";
import {
  readSessionToken,
  verifySession,
} from "@/lib/session";
import { isGoogleSupportedLanguage } from "@/lib/i18n/server";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { BUNDLED_UI_LANGUAGE_CODES } from "@/lib/i18n/messages";
import type { DeviceProfile } from "@/packages/contracts/src/device";
import type { ApiErrorEnvelope } from "@/packages/contracts/src/errors";
import { SyncRequestSchema } from "@/packages/contracts/src/sync";
import { SyncRevisionConflictError } from '@/packages/domain/sync/revision';

const BUNDLED_UI_LANGUAGE_CODE_SET = new Set(
  BUNDLED_UI_LANGUAGE_CODES.map(normalizeLanguageCode),
);

function syncError(
  error: string,
  code: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { success: false, error, code, ...(details === undefined ? {} : { details }) },
    { status },
  );
}

async function validateSyncLanguages(body: SyncRequest): Promise<NextResponse | null> {
  if (body.settings_language !== undefined) {
    const supported = BUNDLED_UI_LANGUAGE_CODE_SET.has(
      normalizeLanguageCode(body.settings_language),
    );
    if (!supported) {
      return syncError(
        "settings_language must have a bundled interface translation",
        "INVALID_SETTINGS_LANGUAGE",
        400,
      );
    }
  }

  for (const [field, value] of [
    ["language_from", body.language_from],
    ["language_to", body.language_to],
  ] as const) {
    if (value === undefined || value === null) continue;
    const supported = await isGoogleSupportedLanguage(value).catch(() => false);
    if (!supported) {
      return syncError(
        `${field} must be supported by Google Translate`,
        "INVALID_LANGUAGE_PAIR",
        400,
        { field },
      );
    }
  }
  return null;
}

function readDeviceProfile(request: NextRequest, body?: SyncRequest): DeviceProfile {
  return {
    platform:
      body?.deviceProfile?.platform ??
      (request.headers.get("x-device-platform") as DeviceProfile["platform"] | null) ??
      undefined,
    formFactor:
      body?.deviceProfile?.formFactor ??
      (request.headers.get("x-device-form-factor") as DeviceProfile["formFactor"] | null) ??
      undefined,
  };
}

export async function POST(request: NextRequest) {
  const timer = createRouteTimer();
  let parsedRequest: SyncRequest | null = null;
  try {
    const rawBody = await request.json().catch(() => null);
    const parsedBody = SyncRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const errorEnvelope: ApiErrorEnvelope = {
        error: "Invalid sync request",
        code: "INVALID_SYNC_REQUEST",
        details: parsedBody.error.issues,
      };
      return timer.applyHeaders(
        NextResponse.json(
          {
            success: false,
            ...errorEnvelope,
          },
          { status: 400 },
        ),
      );
    }
    const body: SyncRequest = parsedBody.data;
    parsedRequest = body;
    timer.mark("parse_body");
    const deviceId = body.deviceId;
    const userId = body.userId;

    if (!deviceId && !userId) {
      return syncError("deviceId or userId is required", "SYNC_IDENTITY_REQUIRED", 400);
    }

    const sessionToken = readSessionToken(request);
    const session = await verifySession(sessionToken);
    timer.mark("verify_session");
    if (!session?.userId) {
      const unauthorized = syncError("Authentication required", "AUTH_REQUIRED", 401);
      timer.mark("return_unauthorized");
      return timer.applyHeaders(unauthorized);
    }

    const languageError = await validateSyncLanguages(body);
    if (languageError) return languageError;

    const resolvedUser = await withRetryOnRecoverableDatabaseError(() =>
      resolveSyncUser(deviceId || null, userId || null, session.userId),
    );
    timer.mark("resolve_user");
    if (!resolvedUser) {
      const failed = syncError("Failed to get or create user", "SYNC_USER_RESOLUTION_FAILED", 500);
      timer.mark("return_user_error");
      return timer.applyHeaders(failed);
    }

    await touchUserDevice(resolvedUser.id, deviceId, readDeviceProfile(request, body));
    const result = await applySyncMutations({ user: resolvedUser, request: body });
    timer.mark("apply_mutations");

    // Read the survey_responses back fresh rather than echo the request body:
    // write-once semantics mean this device's own write may have lost a race
    // to another device, and this is what lets it self-correct in the same
    // round-trip instead of waiting for the next GET.
    const surveyResponses = body.survey_responses
      ? await getUserSurveyResponses(result.user.id)
      : undefined;

    const response = await withSessionCookie(
      buildSyncAckPayload(result.user, {
        applied_review_event_ids: result.appliedReviewEventIds,
        applied_client_op_ids: result.clientOpIds,
        op_results: result.opResults,
        ...(surveyResponses && {
          survey_responses: Object.fromEntries(
            Object.entries(surveyResponses).map(([surveyId, value]) => [
              surveyId,
              { choice: value.choice, free_text: value.freeText, dismissed: value.dismissed },
            ]),
          ),
        }),
      }),
      result.user.id,
      result.user.userRole,
    );
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
    if (error instanceof SyncRevisionConflictError) {
      const clientOpIds = parsedRequest?.client_op_ids ?? [];
      return timer.applyHeaders(NextResponse.json({
        success: false,
        error: error.message,
        code: 'SYNC_CONFLICT',
        details: { domain: error.domain },
        op_results: clientOpIds.map((clientOpId) => ({
          clientOpId,
          status: 'conflict' as const,
          code: 'STALE_REVISION',
        })),
      }, { status: 409 }));
    }
    if (isTransientDatabaseError(error)) {
      return databaseUnavailableResponse(timer, error, "Sync database unavailable:");
    }
    console.error("Sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to sync data";
    return timer.applyHeaders(
      syncError(errorMessage, "SYNC_INTERNAL_ERROR", 500),
    );
  }
}

export async function GET(request: NextRequest) {
  const timer = createRouteTimer();
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId =
      request.headers.get("x-device-id") || searchParams.get("deviceId");
    const userId = searchParams.get("userId");
    const since = parseSinceCursor(searchParams.get("since"));
    const contentRev = searchParams.get("contentRev");

    if (!deviceId && !userId) {
      return syncError("deviceId or userId is required", "SYNC_IDENTITY_REQUIRED", 400);
    }

    const sessionToken = readSessionToken(request);
    const session = await verifySession(sessionToken);
    timer.mark("verify_session");
    if (!session?.userId) {
      const unauthorized = syncError("Authentication required", "AUTH_REQUIRED", 401);
      timer.mark("return_unauthorized");
      return timer.applyHeaders(unauthorized);
    }

    const user = await withRetryOnRecoverableDatabaseError(() =>
      resolveSyncUser(deviceId, userId, session.userId),
    );
    timer.mark("resolve_user");
    if (!user) {
      console.error("Failed to resolve user", {
        hasDeviceId: Boolean(deviceId),
        hasUserId: Boolean(userId),
      });
      const failed = syncError("Failed to get or create user", "SYNC_USER_RESOLUTION_FAILED", 500);
      timer.mark("return_user_error");
      return timer.applyHeaders(failed);
    }

    await touchUserDevice(user.id, deviceId, readDeviceProfile(request));
    const payload = await readSyncPayload({
      user,
      since,
      contentRev,
      mark: (name) => timer.mark(name),
    });
    const response = await withSessionCookie(payload, user.id, user.userRole);
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
    if (isTransientDatabaseError(error)) {
      return databaseUnavailableResponse(timer, error, "Fetch database unavailable:");
    }
    console.error("Fetch error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch data";
    return timer.applyHeaders(
      syncError(errorMessage, "SYNC_INTERNAL_ERROR", 500),
    );
  }
}
