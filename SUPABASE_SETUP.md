# Supabase Setup Guide

This guide will help you connect your app to Supabase.

## Step 1: Get Your Supabase Connection Strings

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database** (or click **Connect** in the sidebar)
3. Scroll down to **Connection String** section

## Step 2: Choose the Right Connection String

Since you're using **Drizzle ORM** with PostgreSQL connections, choose the mode that matches the client network and workload:

### Option A: Direct Connection (When Your Client Has IPv6)
- Use the **Direct Connection** string
- Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
- Best for: Migrations, `pg_dump`, restores, and direct database access when your environment supports IPv6
- Limitation: Supabase direct database hosts resolve through IPv6 by default

### Option B: Session Pooler (IPv4-Compatible Admin Alternative)
- Use the **Session Pooler** connection string
- Format: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`
- Best for: Drizzle migrations and `psql` from networks that cannot reach the IPv6 direct connection
- Supports both IPv4 and IPv6

### Option C: Transaction Pooler (Production Serverless Traffic)
- Use the **Transaction Pooler** connection string for deployed serverless app traffic
- Format: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
- Best for: Production apps, serverless functions (Vercel, etc.)
- Limitation: Does not support prepared statements; do not choose it for manual migration or `psql` sessions

### Which One to Use?

**For migrations or `psql`:**
- Use **Direct Connection** if your machine supports IPv6
- Use **Session Pooler** if the direct host fails to resolve or your network is IPv4-only

**For your application (Next.js, API routes):**
- Use the **Transaction Pooler** for production/serverless traffic

**Why?**
- Direct connection: Best direct administrative path, but requires IPv6 by default
- Session pooler: IPv4-compatible alternative for migration/admin sessions
- Transaction pooler: Better connection management for serverless application traffic

## Step 3: Create Environment File

1. Copy the example file:

   ```bash
   cp .env.example .env.local
   ```

2. Set `DATABASE_URL` in `.env.local`:
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

## Step 5: Migrate Local Data to Remote Supabase

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

3. Prefer the **Direct connection** string for dump/restore when your machine has IPv6. If it does not, arrange a supported IPv4 admin path (such as Supabase's IPv4 add-on) before restoring production data.

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

**Note**: For dump scripts, the default local Supabase connection is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. If your local setup is different, set `LOCAL_DATABASE_URL` in `.env.local`.

## Step 6: Verify Connection

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

## Step 7: Production Setup

For production deployments (e.g., Vercel):

1. Add your `DATABASE_URL` to your hosting platform's environment variables
2. Use the **Transaction Pooler** string for serverless application traffic
3. Make sure to use the production database password (not the local one)

### Vercel Example

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `DATABASE_URL` with your Supabase connection string (use Transaction Pooler)
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

### Direct Connection Fails to Resolve
- Supabase Direct URLs such as `db.<project-ref>.supabase.co:5432` require IPv6 by default
- From an IPv4-only machine, use the **Session Pooler** URL from the dashboard Connect panel for Drizzle migrations and `psql`
- Use port `5432` for Session Pooler; port `6543` is Transaction Pooler for serverless application traffic

## Security Notes

- ⚠️ **Never commit `.env.local` to git** (it's already in `.gitignore`)
- Use different passwords for development and production
- Rotate your database password regularly
- Use connection pooling in production to avoid connection limits
- Use Direct Connection or Session Pooler for manual administration; use Transaction Pooler for serverless application traffic

## Additional Resources

- [Supabase Database Connection Docs](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
