import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "../connection-string";

describe("normalizeDatabaseUrl", () => {
  it("encodes malformed percent escapes in credentials", () => {
    const url = normalizeDatabaseUrl(
      "postgresql://user:pa%ss@localhost:5432/postgres"
    );

    expect(url).toBe("postgresql://user:pa%25ss@localhost:5432/postgres");
  });

  it("preserves already encoded credentials", () => {
    const url = normalizeDatabaseUrl(
      "postgresql://user:pa%25ss@localhost:5432/postgres"
    );

    expect(url).toBe("postgresql://user:pa%25ss@localhost:5432/postgres");
  });
});
