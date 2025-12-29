# Setup Guide for WordLink on Cloudflare Pages

This guide walks you through setting up the WordLink app on Cloudflare Pages with D1 database.

## Step 1: Create D1 Database

1. Install pnpm and Wrangler CLI (if not already installed):
   ```bash
   # Install pnpm
   npm install -g pnpm
   # Or enable corepack (recommended)
   corepack enable
   
   # Install Wrangler
   pnpm add -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Create the D1 database:
   ```bash
   pnpm run db:create
   ```

4. Copy the database ID from the output and update `wrangler.toml`:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "wordlink-db"
   database_id = "YOUR_DATABASE_ID_HERE"  # Paste the ID here
   ```

## Step 2: Run Database Migrations

Run migrations locally (for testing):
```bash
pnpm run db:migrate
```

## Step 3: Deploy to Cloudflare Pages

### Option A: Via Cloudflare Dashboard (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages
2. Click "Create application" → "Pages" → "Connect to Git"
3. Connect your repository
4. Configure build settings:
   - **Framework preset**: Next.js
   - **Build command**: `pnpm run build`
   - **Build output directory**: `.vercel/output/static` (or check what next-on-pages outputs)
   - **Root directory**: `/` (or your project root)

5. **Important**: Add environment variables:
   - Go to your Pages project → Settings → Environment variables
   - You don't need to add DB here - it's configured via bindings

6. **Configure D1 Database Binding**:
   - Go to your Pages project → Settings → Functions
   - Scroll to "D1 database bindings"
   - Click "Add binding"
   - Variable name: `DB`
   - D1 database: Select `wordlink-db` (or the name you created)

7. **Run production migrations**:
   ```bash
   pnpm run db:migrate:remote
   ```

### Option B: Via Wrangler CLI

1. Build the project:
   ```bash
   pnpm run build
   ```

2. Deploy:
   ```bash
   wrangler pages deploy .vercel/output/static
   ```

   (Adjust the path based on where next-on-pages outputs files)

## Step 4: Verify Deployment

1. Visit your Cloudflare Pages URL
2. Open browser console and check for any errors
3. Test the sync functionality by:
   - Making some progress on one device
   - Checking if it syncs to another device (or refresh)

## Troubleshooting

### Database not available error

- Make sure D1 binding is configured in Cloudflare Pages settings
- Verify the binding name matches `DB` in your code
- Check that migrations have been run: `pnpm run db:migrate:remote`

### Build fails

- Make sure all dependencies are installed: `pnpm install`
- Check Node.js version (should be 18+)
- Verify `next.config.js` is correct
- Ensure pnpm is installed: `corepack enable` or `npm install -g pnpm`

### API routes not working

- Ensure you're using `@cloudflare/next-on-pages` for build
- Check that API routes are in `app/api/` directory
- Verify the runtime is set to `edge` in API routes

## Local Development with D1

For local development, you can use Wrangler to run a local D1 instance:

```bash
wrangler pages dev .next
```

This will start a local server with D1 database access.

## Notes

- The app uses device IDs stored in localStorage for user identification
- No authentication is required - each device gets a unique ID
- Data syncs automatically when changes occur (debounced by 1 second)
- All data is stored in Cloudflare D1 (SQLite database)


