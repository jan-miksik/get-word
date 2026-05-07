import { afterEach, describe, expect, it } from "vitest";
import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "@/lib/providers/crypto";

const ORIGINAL_SECRET = process.env.APP_ENCRYPTION_SECRET;

afterEach(() => {
  process.env.APP_ENCRYPTION_SECRET = ORIGINAL_SECRET;
});

describe("provider secret crypto", () => {
  it("encrypts and decrypts secrets with v1 format", () => {
    process.env.APP_ENCRYPTION_SECRET = "0123456789abcdef0123456789abcdef";
    const cipher = encryptProviderSecret("sk-openrouter-test");
    expect(cipher.startsWith("v1:")).toBe(true);

    const decrypted = decryptProviderSecret(cipher);
    expect(decrypted.secret).toBe("sk-openrouter-test");
    expect(decrypted.wasEncrypted).toBe(true);
  });

  it("handles legacy plaintext values for backward compatibility", () => {
    const decrypted = decryptProviderSecret("legacy-plain-key");
    expect(decrypted.secret).toBe("legacy-plain-key");
    expect(decrypted.wasEncrypted).toBe(false);
  });
});
