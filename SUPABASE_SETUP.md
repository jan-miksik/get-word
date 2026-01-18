# Supabase Setup Guide

This guide will help you connect your app to Supabase.

## Step 1: Get Your Supabase Connection Strings

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database** (or click **Connect** in the sidebar)
3. Scroll down to **Connection String** section

## Step 2: Choose the Right Connection String

Since you're using **Drizzle ORM** with direct PostgreSQL connections, you have two options:

### Option A: Direct Connection (Recommended for Development & Admin Operations)
- Use the **Direct Connection** string
- Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
- Best for: Local development, migrations, `pg_dump`, `psql`, and direct database access
- **Required for**: Database dumps, restores, and administrative operations

### Option B: Connection Pooler (Recommended for Production)
- Use the **Transaction Pooler** or **Session Pooler** connection string
- Format: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
- Best for: Production apps, serverless functions (Vercel, etc.)
- Better performance and connection management
- **Not suitable for**: `pg_dump`, `psql`, or other administrative operations

### Which One to Use?

**For `pg_dump` and `psql` operations (migrations, dumps):**
- ✅ **Use DIRECT connection** - Required for administrative operations

**For your application (Next.js, API routes):**
- ✅ **Use Connection Pooler** - Better for production/serverless

**Why?**
- Direct connection: Full PostgreSQL features, required for `pg_dump`, `psql`, migrations
- Pooler: Better connection management, required for serverless (Vercel, etc.), but limited for admin operations

## Step 3: Create Environment File

1. Create `.env.local` file in the project root (if it doesn't exist)

2. Add your connection string:
   ```env
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

   **Important**: Replace:
   - `[YOUR-PASSWORD]` with your database password (URL-encoded if it contains special characters)
   - `[YOUR-PROJECT-REF]` with your Supabase project reference ID

### Finding Your Project Reference

Your project reference is visible in:
- Your Supabase project URL: `https://[PROJECT-REF].supabase.co`
- Settings → General → Reference ID

### URL Encoding Your Password

If your password contains special characters, you need to URL-encode them:
- `@` becomes `%40`
- `#` becomes `%23`
- `$` becomes `%24`
- `%` becomes `%25`
- etc.

Or use the connection string builder in Supabase dashboard which handles this automatically.

## Step 4: Run Database Migrations

Once your `.env.local` is configured, run the migrations to create your database schema:

```bash
# Generate migrations from your schema (if needed)
pnpm run db:generate

# Push schema to Supabase (or run migrations)
pnpm run db:push
```

Or if you prefer to use migrations:

```bash
# Apply migrations
pnpm run db:migrate
```

## Step 5: Seed Your Database (Optional)

If you have seed data:

```bash
pnpm run db:seed
```

## Step 6: Migrate Local Data to Remote Supabase

If you have data in your local Supabase database that you want to migrate to the remote Supabase:

### Option 1: SQL Dump (Simplest - Recommended)

1. **Make sure local Supabase is running:**
   ```bash
   npx supabase start
   ```

2. **Ensure remote schema is up to date:**
   ```bash
   pnpm run db:push
   ```

3. **Use DIRECT connection string in `.env.local`** for `DATABASE_URL` (required for `pg_dump`/`psql`)

4. **Run dump & restore:**
   ```bash
   pnpm run db:dump-restore
   ```

   This script will:
   - Export all data from your local database (words, users, progress, memory hooks, category filters)
   - Restore it to your remote Supabase database
   - Handle data-only migration (schema must already exist on remote)

5. **Verify the migration:**
   ```bash
   pnpm run db:studio
   ```

### Option 2: Full Dump (Schema + Data)

If you want to migrate everything including schema:

```bash
pnpm run db:dump-restore-full
```

⚠️ **Warning**: This will replace the entire remote database schema and data!

### Option 3: TypeScript Migration Script

For more control and intelligent duplicate handling:

1. **Make sure local Supabase is running:**
   ```bash
   npx supabase start
   ```

2. **Ensure remote schema is up to date:**
   ```bash
   pnpm run db:push
   ```

3. **Run migration:**
   ```bash
   pnpm run db:migrate-to-supabase
   ```

   This script will:
   - ✅ Export all tables from local database
   - ✅ Import to remote Supabase with conflict handling
   - ✅ Map user IDs correctly for foreign key relationships
   - ✅ Skip duplicates intelligently
   - ✅ Preserve all your progress, memory hooks, and filters

4. **Verify the migration:**
   ```bash
   pnpm run db:studio
   ```

**Note**: For dump scripts, the default local Supabase connection is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. If your local setup is different, set `LOCAL_DATABASE_URL` in `.env.local`.

## Step 7: Verify Connection

You can verify your connection by:

1. **Using Drizzle Studio**:
   ```bash
   pnpm run db:studio
   ```
   This will open a web interface to browse your database.

2. **Check your app**: Start the dev server and verify it connects:
   ```bash
   pnpm run dev
   ```

## Production Setup

For production deployments (e.g., Vercel):

1. Add your `DATABASE_URL` to your hosting platform's environment variables
2. Use the **Connection Pooler** string for better performance
3. Make sure to use the production database password (not the local one)

### Vercel Example

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `DATABASE_URL` with your Supabase connection string (use Connection Pooler)
3. Select the appropriate environment (Production, Preview, Development)

## Troubleshooting

### Connection Refused
- Check that your IP is allowed in Supabase Dashboard → Settings → Database → Connection Pooling
- For local development, you may need to allow your IP address

### Authentication Failed
- Verify your password is correct and URL-encoded
- Check that you're using the right connection string format
- Ensure you're using the database password, not your Supabase account password

### SSL Required
If you get SSL errors, add `?sslmode=require` to your connection string:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
```

### Connection Pool Exhausted
- Use the Connection Pooler string instead of Direct Connection
- Check your connection limits in Supabase Dashboard

### pg_dump/psql Fails with Pooler Connection
- **Always use Direct Connection** for `pg_dump` and `psql` operations
- The pooler connection has limitations for administrative operations
- Switch `DATABASE_URL` in `.env.local` to Direct Connection temporarily for migrations

## Security Notes

- ⚠️ **Never commit `.env.local` to git** (it's already in `.gitignore`)
- Use different passwords for development and production
- Rotate your database password regularly
- Use connection pooling in production to avoid connection limits
- Use Direct Connection only for administrative operations, not in production app code

## Additional Resources

- [Supabase Database Connection Docs](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
