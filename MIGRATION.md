# Migration Guide: From Vanilla JS to Next.js

This document outlines what has been set up and what still needs to be migrated.

## ✅ Completed

### Infrastructure
- ✅ Next.js project structure with TypeScript
- ✅ Cloudflare D1 database schema and migrations
- ✅ API routes for cross-device synchronization (`/api/sync`)
- ✅ Database utilities (`lib/db.ts`)
- ✅ Client-side sync utilities (`lib/sync.ts`)
- ✅ Device ID system (`lib/device-id.ts`)
- ✅ Cloudflare Pages configuration (`wrangler.toml`)
- ✅ Build configuration for Cloudflare Pages

### Data
- ✅ Data structure preserved (can import from `slova.js`)
- ✅ TypeScript types defined for words and progress

## ⏳ Still To Do

### UI Migration
The main UI needs to be migrated from vanilla JavaScript to React/Next.js:

1. **Main App Component** (`app/page.tsx`)
   - Currently just a placeholder
   - Needs to replicate functionality from `script.js` and `index.html`
   - Should use React hooks for state management

2. **Components to Create**:
   - `WordCard` - Display individual word/phrase
   - `TopMenu` - Navigation and controls
   - `SettingsPanel` - User role selection
   - `ProgressPanel` - Progress statistics
   - `CategoryPanel` - Category filtering
   - `MemoryHooksPanel` - Memory hooks info
   - `BottomNav` - Tab navigation

3. **State Management**:
   - Replace `localStorage` direct access with sync utilities
   - Use React state for UI state
   - Use `useEffect` to sync with server on mount
   - Use `debouncedSync` for automatic syncing

4. **Integration Points**:
   - Replace `loadProgress()` calls with `fetchUserData()`
   - Replace `saveProgress()` calls with `syncUserData()` or `debouncedSync()`
   - Replace `loadMemoryHooks()` with data from sync
   - Replace `saveMemoryHooks()` with sync calls
   - Replace `loadCategoryFilter()` with data from sync
   - Replace `saveCategoryFilter()` with sync calls

## Migration Steps

### Step 1: Create React Components

Start by creating the main components based on your existing HTML structure:

```tsx
// components/WordCard.tsx
'use client';
import { useState } from 'react';

export function WordCard({ word, index, progress, onProgressUpdate }) {
  // Migrate createPhraseCard logic here
}
```

### Step 2: Integrate Sync

In your main page component:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { fetchUserData, syncUserData } from '@/lib/sync';

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data on mount
    fetchUserData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // Sync when data changes
  useEffect(() => {
    if (data && !loading) {
      syncUserData({
        progress: Object.values(data.progress),
        memory_hooks: data.memory_hooks,
        category_filters: data.category_filters,
      });
    }
  }, [data, loading]);

  // ... rest of component
}
```

### Step 3: Migrate Logic

- Move spaced repetition logic to utility functions
- Convert event handlers to React event handlers
- Replace DOM manipulation with React state updates
- Keep audio playback logic (works the same in React)

### Step 4: Test Sync

1. Make changes on one device/browser
2. Check that data appears on another device/browser
3. Verify offline behavior (should queue and sync when online)

## Key Differences

### State Management
- **Before**: Direct `localStorage` access
- **After**: React state + sync to server

### Data Flow
- **Before**: `localStorage` → UI
- **After**: Server → React state → UI → Sync to server

### User Identification
- **Before**: No user concept
- **After**: Device ID → User record in database

## Notes

- The existing `styles.css` is already imported via `app/globals.css`
- Audio files in `public/speech/` are accessible as `/speech/...`
- The word data structure remains the same
- Spaced repetition logic can be reused as-is


