---
name: Project Summary - Get Word
description: AI-friendly high-level overview of the Get Word language-learning app, product idea, stack, and architecture
type: project
---

# Get Word Project Summary

Use this as compact context when starting a new AI chat about the project.

## Copy-Paste Overview

Get Word is a personal language-learning web app for building, translating, listening to, and studying vocabulary lists. The product idea is a self-owned alternative to tools like Anki or Duolingo: users can create language pairs, import or edit word lists, generate translations and pronunciation audio, then study with spaced repetition, card/stream views, memory hooks, category filters, and inline minigames.

The app started around Czech/Vietnamese learning but is evolving into a broader multilingual vocabulary system. It supports configurable learning languages, app UI localization, Google-supported language discovery, and TTS availability checks. The learning experience is centered around "known language" and "target language" word pairs rather than one hard-coded language pair.

Core user flows:

- Study vocabulary through a fullscreen card deck.
- Track spaced-repetition progress, due words, forgotten words, and settling words.
- Practice with minigames such as multiple choice, typing, matching, and listening-oriented prompts when audio exists.
- Add personal memory hooks and category filters.
- Create and manage word lists, categories, imported text, translations, and audio.
- Generate or reuse translation results and pronunciation audio with quota-aware provider flows.
- Sync learning state across sessions/devices using a backend database.
- Sign in through device identity, email/social auth, or optional wallet linking.

Tech stack:

- Framework: Next.js 16 with the App Router and React 19.
- Language: TypeScript.
- Styling: Tailwind CSS v4 compiled with `@tailwindcss/cli`, plus existing plain CSS modules and CSS custom properties for themes.
- Database: Supabase Postgres accessed through Drizzle ORM and Drizzle Kit migrations.
- Deployment target: Vercel.
- Package manager: pnpm.
- Testing: Vitest, Testing Library, jsdom.
- Virtualized UI: `@tanstack/react-virtual`.
- Data fetching/state helpers: React hooks plus `@tanstack/react-query` where useful.
- Auth/web3: Reown AppKit, WalletConnect, wagmi, viem; wallet auth is optional.
- External providers: Google Translate, Google Cloud TTS, OpenRouter BYOK/OAuth for AI translation, ArDrive Turbo/Arweave for persistent generated audio storage.

Architecture at a high level:

- The app is organized by feature areas: learning, lists, auth, audio, external providers, shared route utilities, and shared state/sync.
- Client learning state is composed from domain hooks for progress, preferences, memory hooks, category filters, game score, user profile, active list, language settings, and server sync.
- Supabase Postgres is the source of truth for users, word lists, list items, progress, preferences, memory hooks, filters, provider keys, API usage, media assets, and review events.
- The sync API hydrates and persists user learning state. Device identity lets first-time users start without a full account; stronger identity can be linked later.
- Generated audio is content-hashed and deduplicated. The stable app playback URL can redirect to Arweave-backed media.
- Translation and TTS flows are designed to manage cost: dedupe existing content, track Google usage quotas, and support user-provided OpenRouter keys.

Important implementation conventions:

- Run the app with `pnpm dev`, not plain `next dev`, because Tailwind output is generated first.
- Prefer feature-local modules and hooks for new work instead of adding more logic to top-level pages.
- Keep route handlers thin; put shared behavior in feature modules or shared route utilities.
- Use Drizzle migrations for database shape changes.
- Preserve the existing theme system and CSS variables when adding UI.
- Treat provider credentials, OAuth state, API keys, and session secrets as server-only concerns.

Current product direction:

Get Word is moving from a single personal Czech/Vietnamese trainer into a configurable multilingual learning platform. The most important themes are better onboarding for language pairs, durable list ownership/subscription/forking flows, reliable translation and audio generation, quota-aware provider integrations, and a polished study loop that makes repeated practice feel lightweight.
