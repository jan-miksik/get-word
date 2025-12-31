# WordLink - Language Learning App

A Next.js application for learning Czech and Vietnamese, with cross-device progress synchronization using Cloudflare D1.

## Features

- 📚 Word and phrase learning with spaced repetition
- 🔄 Cross-device progress synchronization
- 💾 Cloudflare D1 database (SQLite) for data persistence
- 📱 Responsive design
- 🎯 Category filtering
- 📝 Custom memory hooks

## Setup

### Prerequisites

- Node.js 18+ 
- pnpm (install with `npm install -g pnpm` or `corepack enable`)
- Cloudflare account (for deployment)

### Package Manager Configuration

The project uses pnpm with the following configuration (see `.npmrc`):
- `auto-install-peers=true`: Automatically installs peer dependencies
- `strict-peer-dependencies=true`: Enforces compatibility checks for peer dependencies to prevent version conflicts

This configuration ensures that peer dependencies are automatically installed while maintaining strict version compatibility checks for safer dependency management.

### Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Create Cloudflare D1 database:**
   ```bash
   pnpm run db:create
   ```
   This will output a database ID. Copy it and update `wrangler.toml`:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "wordlink-db"
   database_id = "YOUR_DATABASE_ID_HERE"
   ```

3. **Run database migrations:**
   ```bash
   pnpm run db:migrate
   ```

4. **Start development server:**
   ```bash
   pnpm run dev
   ```

   The app will be available at `http://localhost:3000`

### Deployment to Cloudflare Pages

1. **Build the project:**
   ```bash
   pnpm run build
   ```

2. **Deploy via Cloudflare Dashboard:**
   - Go to Cloudflare Dashboard → Pages
   - Create a new project
   - Connect your Git repository
   - Set build command: `pnpm run build`
   - Set build output directory: `.vercel/output/static` (or the output from next-on-pages)

3. **Configure D1 Database:**
   - In Cloudflare Dashboard → Workers & Pages → D1
   - Create a database (or use existing)
   - Go to your Pages project → Settings → Functions
   - Add D1 database binding:
     - Variable name: `DB`
     - Database: Your D1 database

4. **Run migrations in production:**
   ```bash
   wrangler d1 migrations apply wordlink-db --remote
   ```

## Project Structure

```
wordlink/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── sync/         # Sync endpoint for cross-device data
│   └── page.tsx           # Main page
├── lib/                   # Utility functions
│   ├── db.ts             # Database operations
│   ├── sync.ts            # Client-side sync utilities
│   └── device-id.ts       # Device identification
├── data/                  # Data files
│   └── words.ts          # Word/phrase data
├── migrations/            # Database migrations
│   └── 0001_initial.sql  # Initial schema
├── public/               # Static assets
│   └── speech/          # Audio files
└── wrangler.toml         # Cloudflare configuration
```

## Database Schema

- **users**: Device-based user identification
- **progress**: Learning progress with spaced repetition stages
- **memory_hooks**: User's custom memory aids
- **category_filters**: User's selected category filters

## How Cross-Device Sync Works

1. Each device gets a unique device ID stored in localStorage (generated on first visit)
2. On first use, a user record is created in D1 database linked to the device ID
3. Progress, memory hooks, and filters are synced via `/api/sync` endpoint
4. Data is automatically synced when changes occur (debounced by 1 second)
5. On app load, data is fetched from the server to sync across devices
6. **Important**: The same device ID on different browsers/devices will share the same user account

## Usage in Your Code

### Syncing Progress

```typescript
import { syncUserData, fetchUserData } from '@/lib/sync';

// Fetch existing data on app load
const data = await fetchUserData();
// Returns: { progress, memory_hooks, category_filters, user }

// Sync progress changes
await syncUserData({
  progress: [
    {
      word_index: 0,
      stage_index: 1,
      known_count: 1,
      unknown_count: 0,
      last_known_at: Date.now(),
      last_unknown_at: null,
      next_due_at: Date.now() + 60000,
    }
  ]
});

// Sync memory hooks
await syncUserData({
  memory_hooks: {
    0: "My custom memory hook",
    1: null, // Delete hook for word index 1
  }
});

// Sync category filters
await syncUserData({
  category_filters: ['basic', 'phrase']
});

// Update user role
await syncUserData({
  role: 'cz' // or 'vi'
});
```

### Using Debounced Sync

For automatic syncing on changes:

```typescript
import { debouncedSync } from '@/lib/sync';

// This will automatically sync after 1 second of inactivity
debouncedSync({
  progress: [...],
  memory_hooks: {...}
});
```

## Development Notes

- The app uses `@cloudflare/next-on-pages` to run Next.js on Cloudflare Pages
  - Note: This package is deprecated but still functional. Consider migrating to OpenNext when it becomes available.
- D1 database is accessed via request context in API routes
- Device ID is used for user identification (no authentication required)
- All data is automatically synced across devices with the same device ID

## License

MIT

