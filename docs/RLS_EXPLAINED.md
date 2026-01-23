# Row Level Security (RLS) Explained

## What is Row Level Security?

**Row Level Security (RLS)** is a PostgreSQL feature that lets you control access to individual rows in a table based on policies. It's like having a bouncer at a club who checks each person before letting them in, but for database rows.

### The Problem It Solves

Without RLS, if someone has access to a table, they can see **all rows** in that table. With RLS, you can say:
- "Users can only see their own progress"
- "Admins can see everything"
- "Public users can only see published content"

## How RLS Works

### 1. **Enable RLS on a Table**
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

Once enabled, **all access is blocked by default** unless a policy allows it.

### 2. **Create Policies**

Policies define **who can do what**:

```sql
-- Example: Users can only see their own data
CREATE POLICY "Users see own data"
  ON user_progress
  FOR SELECT
  USING (user_id = current_setting('app.user_id')::uuid);
```

### 3. **Policy Components**

A policy has three parts:

- **Operation**: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, or `ALL`
- **USING clause**: Determines which rows can be **read**
- **WITH CHECK clause**: Determines which rows can be **written**

## Two Database Connection Types

### Type 1: Direct PostgreSQL Connection (What You're Using)

```
Your Next.js App → postgres library → PostgreSQL Database
```

- **Bypasses RLS entirely** (unless you explicitly set role)
- Uses your `DATABASE_URL` connection string
- Full database privileges
- RLS policies **don't apply** to these connections

### Type 2: Supabase REST API (PostgREST)

```
Client → Supabase REST API → PostgreSQL Database
```

- **RLS policies ARE enforced**
- Uses Supabase API keys (anon key, service role key)
- Limited to what policies allow
- This is why Supabase warns about RLS

## Your Current Setup

### What You Have:
- ✅ Direct PostgreSQL connections via `postgres` library
- ✅ Drizzle ORM for queries
- ✅ Your own API routes (`/api/sync`) that control access
- ❌ Not using Supabase REST API

### What This Means:
- **RLS doesn't affect your app** - your direct connections bypass it
- **Supabase warns you** because tables in `public` schema are exposed to PostgREST
- **If someone gets your Supabase API keys**, they could access data via REST API (without RLS)

## RLS Policy Examples

### Example 1: Allow Everything (What You Need Now)

Since you're using direct connections, you can create permissive policies:

```sql
CREATE POLICY "Allow all for service role"
  ON users
  FOR ALL
  USING (true)      -- Can read all rows
  WITH CHECK (true); -- Can write all rows
```

This policy:
- Applies **only** to Supabase REST API calls
- Doesn't affect your direct PostgreSQL connections
- Satisfies Supabase's security warning

### Example 2: User-Specific Access (If You Used REST API)

If you were using Supabase REST API with authentication:

```sql
-- Users can only see their own progress
CREATE POLICY "Users see own progress"
  ON user_progress
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can only insert their own progress
CREATE POLICY "Users insert own progress"
  ON user_progress
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### Example 3: Role-Based Access

```sql
-- Admins can see everything
CREATE POLICY "Admins see all"
  ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );
```

## When RLS Matters vs. Doesn't Matter

### ✅ RLS DOESN'T Matter When:
- You use **direct PostgreSQL connections** (like you do)
- You control access in your **application code** (like `/api/sync`)
- You never expose Supabase REST API to clients

### ⚠️ RLS DOES Matter When:
- You use **Supabase REST API** (`@supabase/supabase-js` client)
- You want **defense in depth** (multiple security layers)
- You might accidentally expose REST API endpoints
- You want to satisfy Supabase security warnings

## Security Best Practices

### Option 1: Enable RLS with Permissive Policies (Recommended)

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Allow all operations (only affects REST API)
CREATE POLICY "Allow all for service role"
  ON users FOR ALL
  USING (true) WITH CHECK (true);
```

**Pros:**
- ✅ Satisfies Supabase warnings
- ✅ Defense in depth
- ✅ Doesn't affect your app
- ✅ Protects if REST API is accidentally used

**Cons:**
- None really - it's just extra security

### Option 2: Disable PostgREST Exposure

If you never plan to use Supabase REST API, you could:
1. Remove tables from `public` schema (complex)
2. Or just enable RLS with permissive policies (easier)

### Option 3: Proper RLS Policies (If You Use REST API)

If you switch to Supabase REST API later:

```sql
-- Users can only access their own data
CREATE POLICY "Users access own data"
  ON user_progress
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

## How to Check If RLS Is Working

### Test with Direct Connection (Your Current Setup)
```typescript
// This will work regardless of RLS
const users = await db.select().from(users);
```

### Test with Supabase REST API
```typescript
// This will be blocked if RLS is enabled without policies
const { data } = await supabase
  .from('users')
  .select('*');
// Error: "new row violates row-level security policy"
```

## Common RLS Patterns

### Pattern 1: Public Read, Authenticated Write
```sql
-- Anyone can read
CREATE POLICY "Public read"
  ON words FOR SELECT
  USING (true);

-- Only authenticated users can write
CREATE POLICY "Authenticated write"
  ON words FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
```

### Pattern 2: Owner-Only Access
```sql
CREATE POLICY "Owner only"
  ON user_progress FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### Pattern 3: Service Role Bypass
```sql
-- Service role (your backend) can do anything
CREATE POLICY "Service role bypass"
  ON users FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

## Your Specific Case

### Current Situation:
1. ✅ Using direct PostgreSQL connections
2. ✅ Access controlled in `/api/sync` route
3. ⚠️ Supabase warns about RLS
4. ❌ Not using Supabase REST API

### Recommendation:
**Enable RLS with permissive policies** - it's the best of both worlds:
- Satisfies security warnings
- Doesn't break your app
- Adds defense in depth
- Protects against accidental REST API exposure

### Migration File:
See `migrations/enable_rls.sql` for the exact SQL to run.

## Summary

- **RLS** = Database-level access control for rows
- **Your app** = Uses direct connections (RLS doesn't apply)
- **Supabase warning** = About REST API exposure (not your direct connections)
- **Solution** = Enable RLS with permissive policies (satisfies warning, doesn't affect app)
- **Future** = If you use REST API, create proper user-specific policies

## Further Reading

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase RLS Examples](https://supabase.com/docs/guides/database/postgres/row-level-security)
