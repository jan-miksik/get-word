-- Enable Row Level Security (RLS) on all tables
-- This is a security best practice for Supabase

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_progress table
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_memory_hooks table
ALTER TABLE public.user_memory_hooks ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_category_filters table
ALTER TABLE public.user_category_filters ENABLE ROW LEVEL SECURITY;

-- Since you're using direct PostgreSQL connections (not Supabase REST API),
-- you can create permissive policies that allow all operations
-- These policies only apply if someone uses Supabase's REST API

-- Policy for users table: Allow all operations (since you control access via your API)
CREATE POLICY "Allow all operations for service role"
  ON public.users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy for user_progress table
CREATE POLICY "Allow all operations for service role"
  ON public.user_progress
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy for user_memory_hooks table
CREATE POLICY "Allow all operations for service role"
  ON public.user_memory_hooks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy for user_category_filters table
CREATE POLICY "Allow all operations for service role"
  ON public.user_category_filters
  FOR ALL
  USING (true)
  WITH CHECK (true);
