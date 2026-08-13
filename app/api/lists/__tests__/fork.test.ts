import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockResolveUserFromRequest = vi.fn()
const mockGetListById = vi.fn()
const mockGetListCategories = vi.fn()
const mockGetListItems = vi.fn()
const mockCreateList = vi.fn()
const mockCreateCategory = vi.fn()
const mockDeleteList = vi.fn()
const mockFindMediaByHashes = vi.fn()
const mockGetMediaAssetsByIds = vi.fn()
const mockIsBlockedBetweenUsers = vi.fn((..._args: unknown[]) => false)
const mockGoogleTranslate = vi.fn()
const mockOpenRouterTranslate = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockReturning = vi.fn()
const mockValues = vi.fn(() => ({ returning: mockReturning }))
const mockInsert = vi.fn(() => ({ values: mockValues }))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}))

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  isBlockedBetweenUsers: (...args: unknown[]) => mockIsBlockedBetweenUsers(...args),
  getListCategories: (...args: unknown[]) => mockGetListCategories(...args),
  getListItems: (...args: unknown[]) => mockGetListItems(...args),
  createList: (...args: unknown[]) => mockCreateList(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  deleteList: (...args: unknown[]) => mockDeleteList(...args),
  findMediaByHashes: (...args: unknown[]) => mockFindMediaByHashes(...args),
  getMediaAssetsByIds: (...args: unknown[]) => mockGetMediaAssetsByIds(...args),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: () => mockInsert(),
  },
}))

vi.mock('@/lib/translation', () => ({
  googleTranslate: (...args: unknown[]) => mockGoogleTranslate(...args),
  openRouterTranslate: (...args: unknown[]) => mockOpenRouterTranslate(...args),
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}))

import { POST } from '../[id]/fork/route'

// Deterministic translation dictionary keyed by `${text}|${to}`; falls back to
// `${text}-${to}` so any input always produces an index-aligned result.
const TRANSLATIONS: Record<string, string> = {
  'ahoj|fr': 'salut',
  'ahoj|de': 'hallo',
  'Basics|fr': 'Bases',
  'hello|cs': 'ahoj',
  'hello|fr': 'salut',
  'Basics|cs': 'Základy',
  'základ|de': 'Grundlage',
}

function translateBatch(texts: string[], _from: string, to: string) {
  return texts.map((text) => ({
    text,
    translated: TRANSLATIONS[`${text}|${to}`] ?? `${text}-${to}`,
    status: 'ok' as const,
  }))
}

async function drainStream(res: Response): Promise<{
  events: Array<Record<string, unknown>>
  result: Record<string, unknown> | null
}> {
  const text = await res.text()
  const events = text
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>)
  const done = events.find((event) => event.type === 'done')
  return { events, result: (done?.result as Record<string, unknown>) ?? null }
}

describe('POST /api/lists/[id]/fork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveUserFromRequest.mockResolvedValue({ id: 'user-1' })
    mockGetListById.mockResolvedValue({
      id: 'seed-list',
      ownerId: null,
      name: 'Legacy Czech seed',
      description: 'Seed list',
      languageFrom: 'cz',
      languageTo: 'vi',
      isPublic: true,
    })
    mockGetListCategories.mockResolvedValue([{ id: 'cat-1', name: 'Basics', isSystem: false }])
    mockGetListItems.mockResolvedValue([
      {
        id: 'item-1',
        categoryId: 'cat-1',
        textKnown: 'ahoj',
        textTarget: 'xin chao',
        knownAudioAssetId: 'asset-known',
        knownAudioStatus: 'ready',
        audioAssetId: 'asset-target',
        audioStatus: 'ready',
        notes: null,
      },
    ])
    mockCreateList.mockResolvedValue({
      id: 'forked-list',
      ownerId: 'user-1',
      name: 'Common CS / FR',
      description: 'Seed list',
      languageFrom: 'cs',
      languageTo: 'fr',
      isPublic: false,
    })
    mockCreateCategory.mockResolvedValue({ id: 'fork-cat-1' })
    mockDeleteList.mockResolvedValue(true)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGetMediaAssetsByIds.mockResolvedValue(new Map([
      ['asset-known', {
        id: 'asset-known',
        contentHash: 'hash-known',
        storageType: 'arweave',
        storageRef: 'tx-known',
      }],
      ['asset-target', {
        id: 'asset-target',
        contentHash: 'hash-target',
        storageType: 'arweave',
        storageRef: 'tx-target',
      }],
    ]))
    mockGetUserApiKey.mockResolvedValue('openrouter-key')
    mockGoogleTranslate.mockImplementation(async (texts: string[], from: string, to: string) =>
      translateBatch(texts, from, to),
    )
    mockOpenRouterTranslate.mockImplementation(async (texts: string[], from: string, to: string) =>
      translateBatch(texts, from, to),
    )
    mockReturning.mockResolvedValue([
      {
        id: 'new-item-1',
        textKnown: 'ahoj',
        textTarget: 'salut',
        knownAudioAssetId: null,
        audioAssetId: null,
      },
    ])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('normalizes legacy Czech seed language before translating a cs -> fr fork', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Common CS / FR',
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'google',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    const { result } = await drainStream(res)

    expect(res.status).toBe(200)
    // Item word + category title are batched into one cs -> fr call.
    expect(mockGoogleTranslate).toHaveBeenCalledTimes(1)
    expect(mockGoogleTranslate).toHaveBeenCalledWith(['ahoj', 'Basics'], 'cs', 'fr', {
      source: 'list_fork',
      userId: 'user-1',
    })
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: 'salut',
        translationStatus: 'translated',
      }),
    ])
    expect(result?.copied).toBe(1)
  })

  it('drops both manual and generated comments when the fork changes the language pair', async () => {
    const manualComment = {
      version: 1,
      text: 'manualni poznamka',
      source: 'manual',
      editedAt: '2026-01-01T00:00:00.000Z',
    }
    mockGetListItems.mockResolvedValue([
      { id: 'item-1', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'xin chao', notes: null, comment: manualComment },
      {
        id: 'item-2',
        categoryId: 'cat-1',
        textKnown: 'ahoj',
        textTarget: 'xin chao',
        notes: null,
        comment: { version: 1, text: 'generovana', source: 'generated' },
      },
    ])

    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'google',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    expect(res.status).toBe(200)
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({ comment: null }),
      expect.objectContaining({ comment: null }),
    ])
  })

  it('carries a generated comment when the fork keeps the same language pair', async () => {
    // Source and fork are both cs -> fr, so the generated (pair-specific) note carries.
    mockGetListById.mockResolvedValue({
      id: 'seed-list',
      ownerId: null,
      name: 'CS / FR',
      description: 'Seed list',
      languageFrom: 'cs',
      languageTo: 'fr',
      isPublic: true,
    })
    const generatedComment = { version: 1, text: 'generovana', source: 'generated' }
    mockGetListItems.mockResolvedValue([
      { id: 'item-1', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'salut', notes: null, comment: generatedComment },
    ])

    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'none',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    expect(res.status).toBe(200)
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({ comment: generatedComment }),
    ])
  })

  it('builds a bilingual "known - target" category title when translating', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'google',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    // known side is the source language ('Basics'), target side is translated ('Bases').
    expect(mockCreateCategory).toHaveBeenCalledWith('forked-list', 'Basics - Bases', false)
  })

  it('extracts one side from an already-bilingual category title instead of re-translating the whole thing', async () => {
    mockGetListById.mockResolvedValue({
      id: 'seed-list',
      ownerId: null,
      name: 'CS EN seed',
      description: null,
      languageFrom: 'cs',
      languageTo: 'en',
      isPublic: true,
    })
    mockGetListCategories.mockResolvedValue([{ id: 'cat-1', name: 'základ - basic', isSystem: false }])
    mockGetListItems.mockResolvedValue([
      { id: 'item-1', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'hi', notes: null },
    ])

    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'de',
        translation_provider: 'google',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    const calledTexts = mockGoogleTranslate.mock.calls.flatMap(([texts]) => texts as string[])
    // Only the source-language side ('základ') is translated, never the full title.
    expect(calledTexts).toContain('základ')
    expect(calledTexts).not.toContain('základ - basic')
    expect(mockCreateCategory).toHaveBeenCalledWith('forked-list', 'základ - Grundlage', false)
  })

  it('copies category titles verbatim when category-name translation is disabled', async () => {
    mockGetListById.mockResolvedValue({
      id: 'seed-list',
      ownerId: null,
      name: 'CS EN seed',
      description: null,
      languageFrom: 'cs',
      languageTo: 'en',
      isPublic: true,
    })
    mockGetListCategories.mockResolvedValue([{ id: 'cat-1', name: 'základ - basic', isSystem: false }])
    mockGetListItems.mockResolvedValue([
      { id: 'item-1', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'hi', notes: null },
    ])

    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'de',
        translation_provider: 'google',
        source_language: 'cs',
        translate_category_names: false,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    const calledTexts = mockGoogleTranslate.mock.calls.flatMap(([texts]) => texts as string[])
    // Items are still translated, but the category title is left untouched.
    expect(calledTexts).toContain('ahoj')
    expect(calledTexts).not.toContain('základ')
    expect(mockCreateCategory).toHaveBeenCalledWith('forked-list', 'základ - basic', false)
  })

  it('translates both changed languages from the selected source language', async () => {
    mockGetListById.mockResolvedValue({
      id: 'seed-list',
      ownerId: null,
      name: 'English Vietnamese seed',
      description: 'Seed list',
      languageFrom: 'en',
      languageTo: 'vi',
      isPublic: true,
    })
    mockGetListItems.mockResolvedValue([
      {
        id: 'item-1',
        categoryId: 'cat-1',
        textKnown: 'hello',
        textTarget: 'xin chao',
        notes: null,
      },
    ])

    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Common CS / FR',
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'google',
        source_language: 'en',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    expect(res.status).toBe(200)
    expect(mockGoogleTranslate).toHaveBeenNthCalledWith(1, ['hello', 'Basics'], 'en', 'cs', {
      source: 'list_fork',
      userId: 'user-1',
    })
    expect(mockGoogleTranslate).toHaveBeenNthCalledWith(2, ['hello', 'Basics'], 'en', 'fr', {
      source: 'list_fork',
      userId: 'user-1',
    })
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: 'salut',
        translationStatus: 'translated',
      }),
    ])
  })

  it('copies text and audio links when forking the same language pair', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'vi',
        translation_provider: 'none',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    const { result } = await drainStream(res)

    expect(res.status).toBe(200)
    expect(mockGoogleTranslate).not.toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: 'xin chao',
        knownAudioAssetId: 'asset-known',
        knownAudioStatus: 'ready',
        audioAssetId: 'asset-target',
        audioStatus: 'ready',
      }),
    ])
    expect(result?.cleared_sides).toEqual([])
  })

  it('clears the changed target side and audio when no fork translation provider is selected', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'none',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    const { events, result } = await drainStream(res)

    expect(res.status).toBe(200)
    expect(mockGoogleTranslate).not.toHaveBeenCalled()
    // Category copied verbatim when not translating.
    expect(mockCreateCategory).toHaveBeenCalledWith('forked-list', 'Basics', false)
    // Stream still reports a saving phase, then completes.
    expect(events.some((e) => e.type === 'progress' && e.phase === 'saving')).toBe(true)
    expect(events.at(-1)?.type).toBe('done')
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: null,
        knownAudioAssetId: 'asset-known',
        audioAssetId: null,
        audioStatus: 'none',
        translationStatus: 'pending',
      }),
    ])
    expect(result?.cleared_sides).toEqual(['target'])
  })

  it('translates with OpenRouter BYOK when requested', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'openrouter',
        source_language: 'cs',
        translation_model: 'openai/gpt-4o-mini',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    await drainStream(res)

    expect(res.status).toBe(200)
    expect(mockGetUserApiKey).toHaveBeenCalledWith('user-1', 'openrouter')
    expect(mockOpenRouterTranslate).toHaveBeenCalledWith(
      ['ahoj', 'Basics'],
      'cs',
      'fr',
      'openrouter-key',
      expect.any(String),
    )
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: 'salut',
      }),
    ])
  })

  it('still requires user BYOK for OpenRouter even when a server key exists', async () => {
    vi.stubEnv('OPENROUTER_SERVER_API_KEY', 'server-key-should-not-be-used')
    mockGetUserApiKey.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'openrouter',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/api key/i)
    expect(mockOpenRouterTranslate).not.toHaveBeenCalled()
  })

  it('emits ordered, monotonic progress events that reach the total', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'google',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    const { events } = await drainStream(res)

    const progress = events.filter((e) => e.type === 'progress') as Array<{
      processed: number
      total: number
    }>
    expect(progress.length).toBeGreaterThan(0)
    expect(events.at(-1)?.type).toBe('done')

    let last = -1
    for (const event of progress) {
      expect(event.processed).toBeGreaterThanOrEqual(last)
      last = event.processed
    }
    const final = progress.at(-1)!
    expect(final.processed).toBe(final.total)
  })

  it('dedupes repeated source words to one provider call while counting every item side', async () => {
    mockGetListItems.mockResolvedValue([
      { id: 'item-1', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'xin chao', notes: null },
      { id: 'item-2', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'tam biet', notes: null },
      { id: 'item-3', categoryId: 'cat-1', textKnown: 'ahoj', textTarget: 'chao', notes: null },
    ])
    mockReturning.mockResolvedValue([
      { id: 'n1', textKnown: 'ahoj', textTarget: 'salut', knownAudioAssetId: null, audioAssetId: null },
      { id: 'n2', textKnown: 'ahoj', textTarget: 'salut', knownAudioAssetId: null, audioAssetId: null },
      { id: 'n3', textKnown: 'ahoj', textTarget: 'salut', knownAudioAssetId: null, audioAssetId: null },
    ])

    const req = new NextRequest('http://localhost:3000/api/lists/seed-list/fork', {
      method: 'POST',
      body: JSON.stringify({
        language_from: 'cs',
        language_to: 'fr',
        translation_provider: 'google',
        source_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req, { params: Promise.resolve({ id: 'seed-list' }) })
    const { result } = await drainStream(res)

    // 'ahoj' appears 3x but is translated once (alongside the 'Basics' category title).
    expect(mockGoogleTranslate).toHaveBeenCalledTimes(1)
    expect(mockGoogleTranslate).toHaveBeenCalledWith(['ahoj', 'Basics'], 'cs', 'fr', {
      source: 'list_fork',
      userId: 'user-1',
    })
    // Counts still reflect all three item target sides.
    expect(result?.copied).toBe(3)
    expect(result?.translated).toBe(3)
  })
})
