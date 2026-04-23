import { eq, and, sql } from "drizzle-orm";
import { db } from "../client";
import { userDevices } from "../schema";

export async function touchUserDevice(
  userId: string,
  deviceId: string | null | undefined
): Promise<void> {
  const normalized = deviceId?.trim();
  if (!normalized) return;

  await db
    .insert(userDevices)
    .values({
      userId,
      deviceId: normalized,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userDevices.userId, userDevices.deviceId],
      set: { lastSeenAt: sql`now()` },
    });
}

export async function getUserDevice(
  userId: string,
  deviceId: string
) {
  const results = await db
    .select()
    .from(userDevices)
    .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)))
    .limit(1);
  return results[0] ?? null;
}
