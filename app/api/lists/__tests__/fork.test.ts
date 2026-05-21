import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockResolveUserFromRequest = vi.fn()
const mockGetListById = vi.fn()
const mockGetListCategories = vi.fn()
const mockGetListItems = vi.fn()
const mockCreateList = vi.fn()
const mockCreateCategory = vi.fn()
const mockFindExistingTranslations = vi.fn()
const mockFindMediaByHashes = vi.fn()
const mockGetMediaAssetsByIds = vi.fn()
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
  getListCategories: (...args: unknown[]) => mockGetListCategories(...args),
  getListItems: (...args: unknown[]) => mockGetListItems(...args),
  createList: (...args: unknown[]) => mockCreateList(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  findExistingTranslations: (...args: unknown[]) => mockFindExistingTranslations(...args),
  findMediaByHashes: (...args: unknown[]) => mockFindMediaByHashes(...args),
  getMediaAssetsByIds: (...args: unknown[]) => mockGetMediaAssetsByIds(...args),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: (_table: unknown) => mockInsert(),
  },
}))

vi.mock('@/lib/translation', () => ({
  googleTranslate: (...args: unknown[]) => mockGoogleTranslate(...args),
  openRouterTranslate: (...args: unknown[]) => mockOpenRouterTranslate(...args),
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}))

import { POST } from '../[id]/fork/route'

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
    mockFindExistingTranslations.mockResolvedValue([])
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
    mockGoogleTranslate.mockResolvedValue([
      { text: 'ahoj', translated: 'salut', status: 'ok' },
    ])
    mockOpenRouterTranslate.mockResolvedValue([
      { text: 'ahoj', translated: 'salut', status: 'ok' },
    ])
    mockReturning.mockResolvedValue([
      {
        id: 'new-item-1',
        knownAudioAssetId: null,
        audioAssetId: null,
      },
    ])
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
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(mockGoogleTranslate).toHaveBeenCalledWith(['ahoj'], 'cs', 'fr')
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: 'salut',
        translationStatus: 'translated',
      }),
    ])
    expect(body.copied).toBe(1)
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
    mockGoogleTranslate.mockImplementation(async (texts: string[], from: string, to: string) => {
      if (texts[0] === 'hello' && from === 'en' && to === 'cs') {
        return [{ text: 'hello', translated: 'ahoj', status: 'ok' }]
      }
      if (texts[0] === 'hello' && from === 'en' && to === 'fr') {
        return [{ text: 'hello', translated: 'salut', status: 'ok' }]
      }
      return [{ text: texts[0], translated: null, status: 'error' }]
    })

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

    expect(res.status).toBe(201)
    expect(mockGoogleTranslate).toHaveBeenNthCalledWith(1, ['hello'], 'en', 'cs')
    expect(mockGoogleTranslate).toHaveBeenNthCalledWith(2, ['hello'], 'en', 'fr')
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
    const body = await res.json()

    expect(res.status).toBe(201)
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
    expect(body.cleared_sides).toEqual([])
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
    const body = await res.json()

    expect(res.status).toBe(201)
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
    expect(body.cleared_sides).toEqual(['target'])
  })

  it('translates with OpenRouter BYOK when requested', async () => {
    mockOpenRouterTranslate.mockResolvedValueOnce([
      { text: 'ahoj', translated: 'bonjour', status: 'ok' },
    ])
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

    expect(res.status).toBe(201)
    expect(mockGetUserApiKey).toHaveBeenCalledWith('user-1', 'openrouter')
    expect(mockOpenRouterTranslate).toHaveBeenCalledWith(
      ['ahoj'],
      'cs',
      'fr',
      'openrouter-key',
      expect.any(String),
    )
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        textKnown: 'ahoj',
        textTarget: 'bonjour',
      }),
    ])
  })
})
