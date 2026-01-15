import { eq, or } from "drizzle-orm";
import { db } from "../client";
import { users, type User, type NewUser } from "../schema";

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return results[0] || null;
}

// Get user by device ID
export async function getUserByDeviceId(deviceId: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.deviceId, deviceId))
    .limit(1);
  return results[0] || null;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return results[0] || null;
}

// Get user by wallet address
export async function getUserByWalletAddress(
  walletAddress: string
): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);
  return results[0] || null;
}

// Get or create user by device ID
export async function getOrCreateUserByDeviceId(
  deviceId: string
): Promise<User> {
  const existing = await getUserByDeviceId(deviceId);
  if (existing) return existing;

  const results = await db
    .insert(users)
    .values({ deviceId, role: "vi" })
    .returning();
  return results[0];
}

// Create a new user
export async function createUser(user: NewUser): Promise<User> {
  const results = await db.insert(users).values(user).returning();
  return results[0];
}

// Update user role
export async function updateUserRole(
  userId: string,
  role: "cz" | "vi"
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Link email to user
export async function linkEmailToUser(
  userId: string,
  email: string
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ email, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Link wallet address to user
export async function linkWalletToUser(
  userId: string,
  walletAddress: string
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ walletAddress, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Delete user
export async function deleteUser(userId: string): Promise<boolean> {
  const results = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning();
  return results.length > 0;
}
