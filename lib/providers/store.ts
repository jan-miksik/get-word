import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userApiKeys } from "@/lib/db/schema";
import { decryptProviderSecret, encryptProviderSecret } from "@/lib/providers/crypto";
import type {
  ProviderConnectionMethod,
  ProviderConnectionStatus,
  ProviderConnectionUpsertInput,
  ProviderId,
  PublicProviderConnection,
} from "@/lib/providers/types";

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeStatus(value: string | null): ProviderConnectionStatus {
  return value === "failed" ? "failed" : "connected";
}

function normalizeMethod(value: string | null): ProviderConnectionMethod {
  return value === "oauth" ? "oauth" : "manual";
}

function toPublicConnection(row: {
  provider: ProviderId;
  status: string;
  keyLabel: string | null;
  keyLast4: string | null;
  connectedAt: Date;
  lastValidatedAt: Date | null;
  connectionMethod: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicProviderConnection {
  return {
    provider: row.provider,
    status: normalizeStatus(row.status),
    keyLabel: row.keyLabel,
    keyLast4: row.keyLast4,
    connectedAt: row.connectedAt.toISOString(),
    lastValidatedAt: toIso(row.lastValidatedAt),
    connectionMethod: normalizeMethod(row.connectionMethod),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getProviderConnection(
  userId: string,
  provider: ProviderId,
): Promise<PublicProviderConnection | null> {
  const [row] = await db
    .select({
      provider: userApiKeys.provider,
      status: userApiKeys.status,
      keyLabel: userApiKeys.keyLabel,
      keyLast4: userApiKeys.keyLast4,
      connectedAt: userApiKeys.connectedAt,
      lastValidatedAt: userApiKeys.lastValidatedAt,
      connectionMethod: userApiKeys.connectionMethod,
      createdAt: userApiKeys.createdAt,
      updatedAt: userApiKeys.updatedAt,
    })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
    .limit(1);

  return row ? toPublicConnection(row) : null;
}

export async function listProviderConnections(
  userId: string,
): Promise<PublicProviderConnection[]> {
  const rows = await db
    .select({
      provider: userApiKeys.provider,
      status: userApiKeys.status,
      keyLabel: userApiKeys.keyLabel,
      keyLast4: userApiKeys.keyLast4,
      connectedAt: userApiKeys.connectedAt,
      lastValidatedAt: userApiKeys.lastValidatedAt,
      connectionMethod: userApiKeys.connectionMethod,
      createdAt: userApiKeys.createdAt,
      updatedAt: userApiKeys.updatedAt,
    })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));

  return rows.map(toPublicConnection);
}

export async function upsertProviderSecret(
  input: ProviderConnectionUpsertInput,
): Promise<PublicProviderConnection> {
  const encryptedSecret = encryptProviderSecret(input.plainSecret);
  const now = new Date();

  const [row] = await db
    .insert(userApiKeys)
    .values({
      userId: input.userId,
      provider: input.provider,
      encryptedKey: encryptedSecret,
      keyLabel: input.keyLabel ?? null,
      status: input.status ?? "connected",
      lastValidatedAt: input.lastValidatedAt ?? null,
      connectedAt: now,
      updatedAt: now,
      keyLast4: input.plainSecret.slice(-4),
      connectionMethod: input.connectionMethod ?? "manual",
    })
    .onConflictDoUpdate({
      target: [userApiKeys.userId, userApiKeys.provider],
      set: {
        encryptedKey: encryptedSecret,
        keyLabel: input.keyLabel ?? null,
        status: input.status ?? "connected",
        lastValidatedAt: input.lastValidatedAt ?? null,
        connectedAt: now,
        updatedAt: now,
        keyLast4: input.plainSecret.slice(-4),
        connectionMethod: input.connectionMethod ?? "manual",
      },
    })
    .returning({
      provider: userApiKeys.provider,
      status: userApiKeys.status,
      keyLabel: userApiKeys.keyLabel,
      keyLast4: userApiKeys.keyLast4,
      connectedAt: userApiKeys.connectedAt,
      lastValidatedAt: userApiKeys.lastValidatedAt,
      connectionMethod: userApiKeys.connectionMethod,
      createdAt: userApiKeys.createdAt,
      updatedAt: userApiKeys.updatedAt,
    });

  return toPublicConnection(row);
}

export async function getProviderSecret(
  userId: string,
  provider: ProviderId,
): Promise<string | null> {
  const [row] = await db
    .select({
      id: userApiKeys.id,
      encryptedKey: userApiKeys.encryptedKey,
    })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
    .limit(1);

  if (!row) return null;

  const decrypted = decryptProviderSecret(row.encryptedKey);

  if (!decrypted.wasEncrypted) {
    // Legacy plaintext rows are opportunistically upgraded to encrypted format.
    try {
      const now = new Date();
      await db
        .update(userApiKeys)
        .set({
          encryptedKey: encryptProviderSecret(decrypted.secret),
          keyLast4: decrypted.secret.slice(-4),
          updatedAt: now,
        })
        .where(eq(userApiKeys.id, row.id));
    } catch {
      // Keep read compatibility for legacy plaintext rows even before encryption is configured.
    }
  }

  return decrypted.secret;
}

export async function deleteProviderConnection(
  userId: string,
  provider: ProviderId,
): Promise<boolean> {
  const rows = await db
    .delete(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
    .returning({ id: userApiKeys.id });
  return rows.length > 0;
}

export async function markProviderConnectionStatus(input: {
  userId: string;
  provider: ProviderId;
  status: ProviderConnectionStatus;
  keyLabel?: string | null;
  lastValidatedAt?: Date | null;
}): Promise<PublicProviderConnection | null> {
  const [row] = await db
    .update(userApiKeys)
    .set({
      status: input.status,
      keyLabel: input.keyLabel,
      lastValidatedAt: input.lastValidatedAt ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(userApiKeys.userId, input.userId), eq(userApiKeys.provider, input.provider)))
    .returning({
      provider: userApiKeys.provider,
      status: userApiKeys.status,
      keyLabel: userApiKeys.keyLabel,
      keyLast4: userApiKeys.keyLast4,
      connectedAt: userApiKeys.connectedAt,
      lastValidatedAt: userApiKeys.lastValidatedAt,
      connectionMethod: userApiKeys.connectionMethod,
      createdAt: userApiKeys.createdAt,
      updatedAt: userApiKeys.updatedAt,
    });

  return row ? toPublicConnection(row) : null;
}
