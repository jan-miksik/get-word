import type { User } from "@/lib/db/schema";

export function isLinkedAccountUser(user: User): boolean {
  return Boolean(
    (user.email && user.email.trim().length > 0) ||
      (user.walletAddress && user.walletAddress.trim().length > 0),
  );
}
