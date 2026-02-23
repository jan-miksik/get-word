-- Seed __drizzle_migrations so Drizzle skips 0000, 0001, 0002 (already applied via push or earlier).
-- Run this ONCE when your DB already has the tables but migrate has never been run.
-- Then run: pnpm db:migrate
-- Table is in schema "drizzle".

INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('cd7a424738f36cd8534c4e13ce7e53a8275821de007f3f3de9af7dfb177943f7', 1768813974130),
  ('25377a0e11b0a38a276de725c58f3350a59375ab0131620fa636d1adf388578c', 1768813974131),
  ('4ed76b5d0a30dd71cb025bf216108e05b56d39d3cb0e7aa18cd4c55d46fd4fd8', 1770570819917);
