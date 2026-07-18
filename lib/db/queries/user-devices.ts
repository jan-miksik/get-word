import { sql } from "drizzle-orm";
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
