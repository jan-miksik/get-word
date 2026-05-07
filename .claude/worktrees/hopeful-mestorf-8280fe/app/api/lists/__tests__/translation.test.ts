import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── mocks ────────────────────────────────────────────────────────────
const mockResolveUserFromRequest = vi.fn()
const mockGetListById = vi.fn()
const mockFindExistingTranslations = vi.fn()
const mockUpdateItemTranslations = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockReserveGoogleApiUsage = vi.fn()

vi.mock('@/lib/db', () => ({
  countGoogleApiTextUnits: (texts: string[]) => texts.join('').length,
  getListById: (...args: unknown[]) => mockGetListById(...args),
  findExistingTranslations: (...args: unknown[]) => mockFindExistingTranslations(...args),
  updateItemTranslations: (...args: unknown[]) => mockUpdateItemTranslations(...args),
  reserveGoogleApiUsage: (...args: unknown[]) => mockReserveGoogleApiUsage(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  forbiddenResponse: (msg?: string) =>
    new Response(JSON.stringify({ error: msg ?? 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
}))

const mockGoogleTranslate = vi.fn()
const mockOpenRouterTranslate = vi.fn()

vi.mock('@/lib/translation', () => ({
  googleTranslate: (...args: unknown[]) => mockGoogleTranslate(...args),
  openRouterTranslate: (...args: unknown[]) => mockOpenRouterTranslate(...args),
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}))

import { POST as translateBatch } from '../../translate/batch/route'
import { POST as confirmTranslations } from '../[id]/items/translations/route'

// ── fixtures ─────────────────────────────────────────────────────────
const testUser = { id: 'user-1', deviceId: 'dev-1', role: 'vi', userRole: 'user' }
const testList = {
  id: 'list-1',
  ownerId: 'user-1',
  name: 'My List',
  description: 'Test',
  languageFrom: 'cz',
  languageTo: 'vi',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

type ListRouteContext = { params: Promise<{ id: string }> }
function makeListCtx(id = 'list-1'): ListRouteContext {
  return { params: Promise.resolve({ id }) }
}

// ── POST /api/translate/batch tests ─────────────────────────────────

describe('POST /api/translate/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReserveGoogleApiUsage.mockResolvedValue({
      allowed: true,
      scope: 'translate',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      requestedUnits: 5,
      usedUnits: 5,
      accountLimit: 25000,
      freeMonthlyUnits: 500000,
    })
  })

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'google',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 if items array is missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google' }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 if items array is empty', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({ items: [], provider: 'google' }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 if provider is invalid', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'deepl',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(400)
  })

  it('translates items via google provider', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGoogleTranslate.mockResolvedValue([
      { text: 'hello', translated: 'xin chào', status: 'ok' },
    ])
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'google',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toEqual({
      id: 'i1',
      translated_text: 'xin chào',
      status: 'ok',
      source: 'api',
    })
    expect(mockReserveGoogleApiUsage).toHaveBeenCalledWith({
      userId: 'user-1',
      scope: 'translate',
      units: 5,
      requestCount: 1,
    })
  })

  it('pauses google translation when account reaches the free quota share', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockReserveGoogleApiUsage.mockResolvedValue({
      allowed: false,
      scope: 'translate',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      requestedUnits: 5,
      usedUnits: 25000,
      accountLimit: 25000,
      freeMonthlyUnits: 500000,
      message: 'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.',
    })
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'google',
      }),
    })

    const res = await translateBatch(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('GOOGLE_API_ACCOUNT_LIMIT_REACHED')
    expect(body.error).toMatch(/Reach out to us/)
    expect(mockGoogleTranslate).not.toHaveBeenCalled()
  })

  it('returns 400 for openrouter without BYOK key', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserApiKey.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'openrouter',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/api key/i)
  })

  it('translates items via openrouter provider with BYOK key', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserApiKey.mockResolvedValue('sk-test-key')
    mockOpenRouterTranslate.mockResolvedValue([
      { text: 'hello', translated: 'xin chào', status: 'ok' },
    ])
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'openrouter',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].status).toBe('ok')
    expect(mockOpenRouterTranslate).toHaveBeenCalledWith(
      ['hello'],
      'cs',
      'vi',
      'sk-test-key',
      'google/gemini-2.5-flash-lite',
    )
  })

  it('passes requested OpenRouter model to translation provider', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserApiKey.mockResolvedValue('sk-test-key')
    mockOpenRouterTranslate.mockResolvedValue([
      { text: 'hello', translated: 'xin chào', status: 'ok' },
    ])
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' }],
        provider: 'openrouter',
        translation_model: 'openai/gpt-4.1-mini',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(200)
    expect(mockOpenRouterTranslate).toHaveBeenCalledWith(
      ['hello'],
      'cs',
      'vi',
      'sk-test-key',
      'openai/gpt-4.1-mini',
    )
  })

  it('handles partial failures in translation', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGoogleTranslate.mockResolvedValue([
      { text: 'hello', translated: 'xin chào', status: 'ok' },
      { text: 'complex phrase', translated: null, status: 'error', error: 'Translation failed' },
    ])
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' },
          { id: 'i2', text: 'complex phrase', from_lang: 'cz', to_lang: 'vi' },
        ],
        provider: 'google',
      }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(2)
    expect(body.results[0].status).toBe('ok')
    expect(body.results[1].status).toBe('error')
    expect(body.results[1].error).toBe('Translation failed')
  })

  it('enforces daily limit of 500 translations per user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    // 501 items should be rejected
    const items = Array.from({ length: 501 }, (_, i) => ({
      id: `i${i}`,
      text: `word-${i}`,
      from_lang: 'cz',
      to_lang: 'vi',
    }))
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({ items, provider: 'google' }),
    })
    const res = await translateBatch(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/500|limit/i)
  })
})

// ── POST /api/lists/[id]/items/translations (confirm) tests ─────────

describe('POST /api/lists/[id]/items/translations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({ translations: [] }),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(401)
  })

  it('returns 404 if list not found', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({ translations: [] }),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(404)
  })

  it('returns 403 if not list owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({ translations: [] }),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(403)
  })

  it('returns 400 if translations array is missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(400)
  })

  it('confirms translations and updates items', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockUpdateItemTranslations.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({
        translations: [
          { id: 'item-1', text_target: 'xin chào', status: 'translated' },
          { id: 'item-2', text_target: 'tạm biệt', status: 'manual' },
        ],
      }),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(2)
    expect(mockUpdateItemTranslations).toHaveBeenCalledWith([
      { id: 'item-1', textTarget: 'xin chào', translationStatus: 'translated' },
      { id: 'item-2', textTarget: 'tạm biệt', translationStatus: 'manual' },
    ])
  })

  it('supports confirming known-language translations (input_language=target)', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockUpdateItemTranslations.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({
        translations: [
          { id: 'item-1', text_known: 'hello', status: 'translated' },
        ],
      }),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(1)
    expect(mockUpdateItemTranslations).toHaveBeenCalledWith([
      { id: 'item-1', textKnown: 'hello', translationStatus: 'translated' },
    ])
  })

  it('skips items with no translation text', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockUpdateItemTranslations.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost/api/lists/list-1/items/translations', {
      method: 'POST',
      body: JSON.stringify({
        translations: [
          { id: 'item-1', text_target: 'xin chào', status: 'translated' },
          { id: 'item-2', status: 'manual' }, // no text — skip
        ],
      }),
    })
    const res = await confirmTranslations(req, makeListCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(1)
    expect(body.skipped).toBe(1)
  })
})

// ── DB dedup tests ──────────────────────────────────────────────────

describe('POST /api/translate/batch — DB dedup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses DB dedup and skips already-translated words', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindExistingTranslations.mockResolvedValue([
      { text: 'hello', translatedText: 'xin chào' },
    ])
    mockGoogleTranslate.mockResolvedValue([
      { text: 'world', translated: 'thế giới', status: 'ok' },
    ])
    const req = new NextRequest('http://localhost/api/translate/batch', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { id: 'i1', text: 'hello', from_lang: 'cz', to_lang: 'vi' },
          { id: 'i2', text: 'world', from_lang: 'cz', to_lang: 'vi' },
        ],
        provider: 'google',
        list_id: 'list-1',
        input_language: 'known',
      }),
    })
    mockGetListById.mockResolvedValue(testList)
    const res = await translateBatch(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(2)
    // hello found via dedup
    expect(body.results.find((r: { id: string }) => r.id === 'i1').translated_text).toBe('xin chào')
    expect(body.results.find((r: { id: string }) => r.id === 'i1').source).toBe('dedup')
    // world translated via API
    expect(body.results.find((r: { id: string }) => r.id === 'i2').translated_text).toBe('thế giới')
    expect(body.results.find((r: { id: string }) => r.id === 'i2').source).toBe('api')
    expect(body.dedup_count).toBe(1)
  })
})
