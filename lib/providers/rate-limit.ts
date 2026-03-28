import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthRateLimits } from "@/lib/db/schema";

function getBucketStart(windowMs: number): Date {
  const now = Date.now();
  const bucketMs = Math.floor(now / windowMs) * windowMs;
  return new Date(bucketMs);
}

async function bestEffortCleanup(): Promise<void> {
  if (Math.random() > 0.03) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(oauthRateLimits).where(lt(oauthRateLimits.bucketStart, cutoff));
}

export async function consumeRateLimit(input: {
  key: string;
  endpoint: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
  const windowMs = Math.max(1, input.windowSeconds) * 1000;
  const bucketStart = getBucketStart(windowMs);
  const bucketKey = `${input.endpoint}:${input.key}`;
  const now = new Date();

  const [row] = await db
    .insert(oauthRateLimits)
    .values({
      bucketKey,
      bucketStart,
      requestCount: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [oauthRateLimits.bucketKey, oauthRateLimits.bucketStart],
      set: {
        requestCount: sql`${oauthRateLimits.requestCount} + 1`,
        updatedAt: now,
      },
    })
    .returning({ requestCount: oauthRateLimits.requestCount });

  void bestEffortCleanup();

  const count = row?.requestCount ?? 1;
  const elapsedMs = Date.now() - bucketStart.getTime();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowMs - elapsedMs) / 1000),
  );

  return {
    allowed: count <= input.limit,
    count,
    retryAfterSeconds,
  };
}

export function getClientIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    if (first?.trim()) return first.trim();
  }
  return requestHeaders.get("x-real-ip") ?? "unknown";
}
