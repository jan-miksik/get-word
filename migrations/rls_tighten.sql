-- Tighten RLS policies (defense-in-depth)
-- These apply if someone accesses via Supabase REST API (not the direct PG connection the app uses).
-- Run manually: source .env.local && psql "$DATABASE_URL" -f migrations/rls_tighten.sql

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.users;
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.user_progress;
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.user_memory_hooks;
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.user_category_filters;

-- Enable RLS on words table
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

-- Words: anyone can read, only editors can write
CREATE POLICY "words_select" ON public.words FOR SELECT USING (true);
CREATE POLICY "words_insert" ON public.words FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_role = 'editor'));
CREATE POLICY "words_update" ON public.words FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_role = 'editor'));
CREATE POLICY "words_delete" ON public.words FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_role = 'editor'));

-- Users: can read/update own record only
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (true);

-- User progress: own rows only
CREATE POLICY "progress_select_own" ON public.user_progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "progress_insert_own" ON public.user_progress FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "progress_update_own" ON public.user_progress FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "progress_delete_own" ON public.user_progress FOR DELETE USING (user_id = auth.uid());

-- Memory hooks: own rows only
CREATE POLICY "hooks_select_own" ON public.user_memory_hooks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "hooks_insert_own" ON public.user_memory_hooks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "hooks_update_own" ON public.user_memory_hooks FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "hooks_delete_own" ON public.user_memory_hooks FOR DELETE USING (user_id = auth.uid());

-- Category filters: own rows only
CREATE POLICY "filters_select_own" ON public.user_category_filters FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "filters_insert_own" ON public.user_category_filters FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "filters_delete_own" ON public.user_category_filters FOR DELETE USING (user_id = auth.uid());
