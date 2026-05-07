import crypto from "crypto";

const CIPHER_VERSION = "v1";
const IV_LENGTH = 12;

function decodeSecret(input: string): Buffer {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("APP_ENCRYPTION_SECRET is empty");
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // Fall through to utf8 mode.
  }

  return Buffer.from(trimmed, "utf8");
}

function getEncryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_SECRET;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_SECRET is not configured");
  }

  const key = decodeSecret(raw);
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_SECRET must decode to 32 bytes");
  }
  return key;
}

export function encryptProviderSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${CIPHER_VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptProviderSecret(cipherText: string): {
  secret: string;
  wasEncrypted: boolean;
} {
  if (!cipherText.startsWith(`${CIPHER_VERSION}:`)) {
    return { secret: cipherText, wasEncrypted: false };
  }

  const [, ivB64, tagB64, payloadB64] = cipherText.split(":");
  if (!ivB64 || !tagB64 || !payloadB64) {
    throw new Error("Invalid encrypted secret format");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const payload = Buffer.from(payloadB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(payload), decipher.final()]);
  return { secret: plain.toString("utf8"), wasEncrypted: true };
}
