-- Enable RLS on remaining public tables that were not covered by
-- enable_rls.sql / rls_tighten.sql.
--
-- Context: Supabase's security advisor flags any public.* table without RLS
-- because PostgREST auto-exposes them via the anon/authenticated REST API.
-- This app accesses Postgres only through a direct connection (Drizzle), which
-- bypasses RLS, so enabling RLS here does not affect application behavior.
-- No policies are added — with RLS on and no policies, anon/authenticated
-- roles get zero access, which is the desired state.
--
-- Run manually: source .env.local && psql "$DATABASE_URL" -f migrations/rls_remaining.sql

ALTER TABLE IF EXISTS public.word_lists              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.word_categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.word_list_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media_assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ui_translation_cache    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_devices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.oauth_rate_limits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.google_api_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_list_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.processed_client_ops     ENABLE ROW LEVEL SECURITY;
