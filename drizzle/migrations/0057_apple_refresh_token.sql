-- Sign in with Apple requires an app to revoke the user's tokens when the
-- account is deleted (App Store Review Guideline 5.1.1(v)). The native client
-- signs in with an id_token, so Supabase never holds an Apple refresh token —
-- we exchange the authorization code ourselves and keep the result here,
-- encrypted, for the sole purpose of revoking it on deletion.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "apple_refresh_token" text;
