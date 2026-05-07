import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_API_ACCOUNT_LIMIT_MESSAGE,
  getCurrentGoogleApiPeriodStart,
  getGoogleApiAccountMonthlyLimit,
  getGoogleApiFreeMonthlyUnits,
  getGoogleApiUsageAcrossAccounts,
  getGoogleApiUsageForUser,
} from "@/lib/db";
import {
  isEditor,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";

const SCOPES = ["translate", "tts"] as const;

function buildScopeLimit(scope: (typeof SCOPES)[number]) {
  return {
    scope,
    account_limit: getGoogleApiAccountMonthlyLimit(scope),
    free_monthly_units: getGoogleApiFreeMonthlyUnits(scope),
  };
}

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const periodStart = getCurrentGoogleApiPeriodStart();
  const requestedUserId = request.nextUrl.searchParams.get("user_id");
  const inspectedUserId = isEditor(user) && requestedUserId ? requestedUserId : user.id;

  const [accountRows, globalRows] = await Promise.all([
    getGoogleApiUsageForUser({ userId: inspectedUserId, periodStart }),
    isEditor(user) ? getGoogleApiUsageAcrossAccounts(periodStart) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    period_start: periodStart.toISOString(),
    inspected_user_id: inspectedUserId,
    account: SCOPES.map((scope) => {
      const row = accountRows.find((usage) => usage.scope === scope);
      return {
        ...buildScopeLimit(scope),
        used_units: row?.units ?? 0,
        request_count: row?.requestCount ?? 0,
        paused: (row?.units ?? 0) >= getGoogleApiAccountMonthlyLimit(scope),
        limit_message: GOOGLE_API_ACCOUNT_LIMIT_MESSAGE,
      };
    }),
    ...(globalRows
      ? {
          global: SCOPES.map((scope) => {
            const row = globalRows.find((usage) => usage.scope === scope);
            return {
              scope,
              used_units: row?.units ?? 0,
              request_count: row?.requestCount ?? 0,
              account_count: row?.accountCount ?? 0,
              free_monthly_units: getGoogleApiFreeMonthlyUnits(scope),
            };
          }),
        }
      : {}),
  });
}
