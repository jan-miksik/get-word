import { NextRequest, NextResponse } from "next/server";
import { touchUserDevice } from "@/lib/db";
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
  GET_WORD_SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/session";
import { isGoogleSupportedLanguage } from "@/lib/i18n/server";
import type { DeviceProfile } from "@/features/admin/types";

async function validateSyncLanguages(body: SyncRequest): Promise<NextResponse | null> {
  if (body.settings_language !== undefined) {
    const supported = await isGoogleSupportedLanguage(body.settings_language).catch(() => false);
    if (!supported) {
      return NextResponse.json(
        { error: "settings_language must be supported by Google Translate" },
        { status: 400 },
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
      return NextResponse.json(
        { error: `${field} must be supported by Google Translate` },
        { status: 400 },
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
  try {
    const body: SyncRequest = await request.json();
    timer.mark("parse_body");
    const deviceId = body.deviceId;
    const userId = body.userId;

    if (!deviceId && !userId) {
      return NextResponse.json({ error: "deviceId or userId is required" }, { status: 400 });
    }

    const sessionToken = request.cookies.get(GET_WORD_SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(sessionToken);
    timer.mark("verify_session");
    if (!session?.userId) {
      const unauthorized = NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
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
      const failed = NextResponse.json(
        { error: "Failed to get or create user" },
        { status: 500 },
      );
      timer.mark("return_user_error");
      return timer.applyHeaders(failed);
    }

    await touchUserDevice(resolvedUser.id, deviceId, readDeviceProfile(request, body));
    const result = await applySyncMutations({ user: resolvedUser, request: body });
    timer.mark("apply_mutations");

    const response = await withSessionCookie(
      buildSyncAckPayload(result.user, {
        applied_review_event_ids: result.appliedReviewEventIds,
        applied_client_op_ids: result.clientOpIds,
      }),
      result.user.id,
      result.user.userRole,
    );
    timer.mark("build_response");
    return timer.applyHeaders(response);
  } catch (error) {
    timer.mark("error");
    if (isTransientDatabaseError(error)) {
      return databaseUnavailableResponse(timer, error, "Sync database unavailable:");
    }
    console.error("Sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to sync data";
    return timer.applyHeaders(
      NextResponse.json({ success: false, error: errorMessage }, { status: 500 }),
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
      return NextResponse.json(
        { success: false, error: "deviceId or userId is required" },
        { status: 400 },
      );
    }

    const sessionToken = request.cookies.get(GET_WORD_SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(sessionToken);
    timer.mark("verify_session");
    if (!session?.userId) {
      const unauthorized = NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
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
      const failed = NextResponse.json(
        { success: false, error: "Failed to get or create user" },
        { status: 500 },
      );
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
      NextResponse.json({ success: false, error: errorMessage }, { status: 500 }),
    );
  }
}
