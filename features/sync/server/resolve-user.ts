import { getOrCreateUserByDeviceId, getUserById } from '@/lib/db';
import type { User } from '@/lib/db/schema';

/** Prefer the verified session identity, retaining legacy user/device fallbacks. */
export async function resolveSyncUser(
  deviceId: string | null,
  userId: string | null,
  sessionUserId: string | null,
): Promise<User | null> {
  if (sessionUserId) {
    const sessionUser = await getUserById(sessionUserId);
    if (sessionUser) return sessionUser;

    if (userId) {
      const user = await getUserById(userId);
      if (user) return user;
    }
  }
  if (deviceId) return getOrCreateUserByDeviceId(deviceId);
  return null;
}
