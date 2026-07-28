import { sql } from "drizzle-orm";
import type { DeviceFormFactor, DevicePlatform, DeviceProfile } from "@/features/admin/types";
import { db } from "../client";
import { userDevices } from "../schema";

const DEVICE_PLATFORMS = new Set<DevicePlatform>([
  "ios",
  "android",
  "macos",
  "windows",
  "linux",
  "other",
  "unknown",
]);

const DEVICE_FORM_FACTORS = new Set<DeviceFormFactor>([
  "mobile",
  "tablet",
  "desktop",
  "unknown",
]);

function normalizeDevicePlatform(value: unknown): DevicePlatform | null {
  return typeof value === "string" && DEVICE_PLATFORMS.has(value as DevicePlatform)
    ? (value as DevicePlatform)
    : null;
}

function normalizeDeviceFormFactor(value: unknown): DeviceFormFactor | null {
  return typeof value === "string" && DEVICE_FORM_FACTORS.has(value as DeviceFormFactor)
    ? (value as DeviceFormFactor)
    : null;
}

export async function touchUserDevice(
  userId: string,
  deviceId: string | null | undefined,
  profile: DeviceProfile = {}
): Promise<void> {
  const normalized = deviceId?.trim();
  if (!normalized) return;
  const platform = normalizeDevicePlatform(profile.platform);
  const formFactor = normalizeDeviceFormFactor(profile.formFactor);

  await db
    .insert(userDevices)
    .values({
      userId,
      deviceId: normalized,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...(platform ? { platform } : {}),
      ...(formFactor ? { formFactor } : {}),
    })
    .onConflictDoUpdate({
      target: [userDevices.userId, userDevices.deviceId],
      set: {
        lastSeenAt: sql`now()`,
        ...(platform ? { platform } : {}),
        ...(formFactor ? { formFactor } : {}),
      },
    });
}
