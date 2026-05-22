# Get Word Codebase Tour

This file is a simple map of the repo.

It answers:

- What is this app?
- Where does the important logic live?
- Why is it organized this way?
- What should I read first?
- What can I safely ignore at the beginning?

## 1. What this app is

Get Word is a language-learning app.

The main jobs of the app are:

- show words to learn
- remember your progress with spaced repetition
- let you create and edit word lists
- translate list items
- generate pronunciation audio
- keep your progress synced with the server

In simple words:

- `app/` = web pages and API endpoints
- `features/` = app-specific logic grouped by topic
- `components/` = reusable UI pieces
- `lib/` = shared lower-level helpers, DB access, sync helpers, and domain utilities
- `docs/` = architecture notes and summaries

## 2. The biggest mental model

The repo is trying to keep a clean split between:

- page shells
- feature logic
- shared infrastructure

That means:

- `app/page.tsx` should not become a giant file with all business logic
- `app/api/...` routes should not contain all server logic inline
- feature code should live near other code from the same problem area

Why do it this way?

- easier to find things
- easier to test
- easier to refactor one area without breaking everything
- avoids the common React/Next problem where page files become huge “god files”

Other option:

- keep most logic directly in pages and route files

Why this repo mostly does not choose that:

- it is faster at first
- but it becomes hard to reason about as features grow
- this app already has enough moving parts that separation pays off

## 3. The main app areas

### Learning

This is the core study experience.

Important files:

- `app/page.tsx`
- `features/learning/components/LearningStudyContent.tsx`
- `features/learning/hooks/useLearningPageState.ts`
- `features/learning/hooks/useWordsLoader.ts`
- `features/learning/hooks/useWordStream.ts`
- `hooks/useAppState.ts`

What happens here:

- words are loaded
- user state is loaded
- words are filtered and grouped
- cards or stream view are rendered
- progress updates when the user knows / does not know a word

Why it is split across many files:

- one file loads data
- one file manages page behavior
- one file renders the study UI
- one central hook coordinates shared user state

That split makes the learning flow easier to change without rewriting the whole page.

### Lists

This is the “build and manage your content” area.

Important files:

- `app/lists/page.tsx`
- `features/lists/hooks/useListsWizard.ts`
- `features/lists/client/actions.ts`
- `features/lists/api.ts`
- `features/lists/types.ts`

What happens here:

- fetch lists
- pick a list
- edit category words
- preview diff
- translate missing target text
- generate audio

Why it feels a bit different from learning:

- this page behaves like a wizard
- it has many steps and in-flight states
- so the page still owns more coordination than the learning page

In other words:

- learning = state-heavy study surface
- lists = workflow-heavy editing surface

### Auth

Important files:

- `hooks/useAuth.ts`
- `app/api/auth/link-wallet/route.ts`
- `app/api/auth/logout/route.ts`
- `lib/auth.ts`
- `features/auth/state/userProfile.ts`

This app uses two ideas together:

- device identity
- signed-in wallet/email identity

Why?

- device identity makes first use simple
- linking to a wallet/account lets progress survive across sessions/devices

Other option:

- require full account login before doing anything

Why this repo does not fully choose that:

- higher friction for a learning app
- device-first is simpler for casual use

### Sync

Important files:

- `hooks/useAppState.ts`
- `features/learning/app-state/useServerSync.ts`
- `lib/sync.ts`
- `app/api/sync/route.ts`
- `features/shared/sync/response.ts`

This is one of the most important parts of the app.

What it does:

- load user progress and preferences from the server
- send local changes back to the server
- handle hydration on startup
- keep a local snapshot/cache for faster startup

Why it exists as a separate system:

- learning state is not just UI state
- it has to survive reloads, devices, and offline-ish situations

Other option:

- keep all progress only in React state or only in `localStorage`

Why not:

- too fragile
- hard to sync across devices
- bad for persistence

### Database

Important files:

- `lib/db/schema.ts`
- `lib/db/queries/*`
- `drizzle/migrations/*`

How to think about it:

- `schema.ts` = what tables exist
- `queries/*` = how code talks to those tables
- `drizzle/migrations/*` = history of schema changes

Important tables to know first:

- `users`
- `word_lists`
- `word_categories`
- `word_list_items`
- `user_progress`

Simple meaning:

- user data
- list containers
- sections inside lists
- actual study items
- spaced repetition progress

Why use query files instead of raw SQL everywhere?

- keeps DB logic centralized
- easier to reuse
- easier to test
- easier to replace or optimize later

### Audio and providers

Important files:

- `app/lists/AudioStep.tsx`
- `features/audio/server/generate-batch.ts`
- `lib/audio.ts`
- `lib/audio-availability.ts`
- `app/api/providers/openrouter/*`
- `lib/providers/*`

What this means:

- audio generation is its own feature
- provider connections like OpenRouter are treated as infrastructure, not mixed into page code

Why:

- external services are messy
- separating them keeps failures and credentials handling contained

## 4. The most important “center of gravity” files

If you only read a few files first, read these:

1. `AI_CONTEXT.md`
2. `CLAUDE.md`
3. `app/page.tsx`
4. `hooks/useAppState.ts`
5. `features/learning/app-state/useServerSync.ts`
6. `app/api/sync/route.ts`
7. `app/lists/page.tsx`
8. `features/lists/hooks/useListsWizard.ts`
9. `lib/db/schema.ts`

Why these first:

- they show the app’s boundaries
- they explain how state enters and leaves the system
- they reveal the main architecture choices quickly

## 5. Good reading order

If you want the easiest path, I would read in this order:

### Pass 1: high-level map

- `AI_CONTEXT.md`
- `CLAUDE.md`
- `README.md`

Goal:

- understand project vocabulary
- know where each feature lives

### Pass 2: learning flow

- `app/page.tsx`
- `features/learning/components/LearningStudyContent.tsx`
- `features/learning/hooks/useLearningPageState.ts`
- `hooks/useAppState.ts`
- `features/learning/app-state/useServerSync.ts`

Goal:

- understand the main user experience

### Pass 3: server and data

- `app/api/sync/route.ts`
- `lib/sync.ts`
- `lib/db/schema.ts`
- a few files in `lib/db/queries/`

Goal:

- understand how data is persisted and synced

### Pass 4: content management

- `app/lists/page.tsx`
- `features/lists/hooks/useListsWizard.ts`
- `features/lists/client/actions.ts`
- `app/api/lists/route.ts`

Goal:

- understand how lists are created and edited

## 6. Files and folders you can mostly ignore at first

These are not useless. They are just not good starting points.

- `public/speech/`  
  Large static audio assets.

- `wordbook/`  
  Source/import material, not core runtime logic.

- `drizzle/migrations/meta/*.json`  
  Generated migration snapshots.

- `styles/*.css`  
  Legacy CSS. Useful only when working on existing old styles.

- `ralph/`  
  Separate helper/orchestrator tooling, not the main app runtime.

- `migrations/`  
  Legacy/manual SQL. The main migration path is `drizzle/migrations/`.

- `lib/i18n/messages.ts`  
  Mostly data, not a good architecture starting point.

## 7. Important design choices in plain words

### Why are pages thin?

Because pages are easier to read when they mostly say:

- load this
- connect these hooks
- render this screen

instead of also containing every rule and side effect.

### Why is `useAppState` important?

Because it is the main “state conductor”.

It combines:

- progress
- preferences
- memory hooks
- category filters
- game score
- synced profile data
- active list state

So when you want to understand “where user study state comes from”, this is the best file.

### Why is sync such a big deal?

Because the app is not just showing static words.

It needs to remember:

- what you know
- what is due next
- which list you use
- preferences
- hooks and filters

and it needs to do that reliably.

### Why are there both `words` and `word_list_items` concepts?

This is a sign of evolution in the app.

Older logic used a more global `words` model.
Newer logic is more list-based.

You can see this in places like `app/api/words/route.ts`, which is now read-only and points people toward list-based editing.

So a very important context point is:

- this repo contains some compatibility code from an older design
- the direction is clearly toward list-based data

## 8. Current hotspots

These are places likely to matter during future work:

- `app/lists/page.tsx`
- `app/lists/AudioStep.tsx`
- `app/api/sync/route.ts`
- `components/LearningLanguageOnboarding.tsx`

Why these matter:

- they still coordinate a lot of behavior
- they are more likely to feel “large” or complex
- future cleanup will probably keep extracting logic out of them

## 9. Short explanation of the architecture style

If I had to describe the architecture in one sentence:

This is a Next.js app that is trying to move from “files that do everything” toward “small page shells plus feature-owned logic plus shared infrastructure”.

That is usually a good direction.

Why?

- better boundaries
- less duplication
- easier onboarding
- easier testing

The tradeoff is:

- more files
- sometimes you need to jump between 3 to 5 files to understand one user flow

That tradeoff is normal in apps of this size.

## 10. My personal “open these first” shortlist

If you ask me what is the best 30-minute orientation tour, I would open exactly these:

- `AI_CONTEXT.md`
- `CLAUDE.md`
- `app/page.tsx`
- `hooks/useAppState.ts`
- `features/learning/app-state/useServerSync.ts`
- `app/api/sync/route.ts`
- `app/lists/page.tsx`
- `lib/db/schema.ts`

That gives you:

- page structure
- state flow
- sync flow
- server flow
- database shape

which is most of the app’s real backbone.
