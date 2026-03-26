import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockResolveUserFromRequest = vi.fn()
const mockFindMediaByHashes = vi.fn()
const mockFindMediaByHash = vi.fn()
const mockCreateMediaAsset = vi.fn()
const mockBatchLinkAudioToItems = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockGoogleTTS = vi.fn()
const mockElevenLabsTTS = vi.fn()
const mockUploadAudio = vi.fn()
const mockComputeContentHash = vi.fn()
const mockGetAudioUrl = vi.fn()

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'content-type': 'application/json' } }),
}))

vi.mock('@/lib/db', () => ({
  findMediaByHashes: (...args: unknown[]) => mockFindMediaByHashes(...args),
  findMediaByHash: (...args: unknown[]) => mockFindMediaByHash(...args),
  createMediaAsset: (...args: unknown[]) => mockCreateMediaAsset(...args),
  batchLinkAudioToItems: (...args: unknown[]) => mockBatchLinkAudioToItems(...args),
}))

vi.mock('@/lib/translation', () => ({
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}))

vi.mock('@/lib/audio', () => ({
  computeContentHash: (...args: unknown[]) => mockComputeContentHash(...args),
  googleTTS: (...args: unknown[]) => mockGoogleTTS(...args),
  elevenLabsTTS: (...args: unknown[]) => mockElevenLabsTTS(...args),
  uploadAudio: (...args: unknown[]) => mockUploadAudio(...args),
  getAudioUrl: (...args: unknown[]) => mockGetAudioUrl(...args),
}))

import { POST } from '../generate/batch/route'
import { GET } from '../[hash]/route'

const testUser = {
  id: 'user-1',
  deviceId: 'dev-1',
  role: 'vi',
  userRole: 'user',
}

function makeRequest(body: object) {
  return new NextRequest('http://localhost:3000/api/audio/generate/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/audio/generate/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeContentHash.mockImplementation((text: string, lang: string, provider: string) => `hash_${text}_${lang}_${provider}`)
    mockGetAudioUrl.mockImplementation((hash: string) => `/api/audio/${hash}`)
  })

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const res = await POST(makeRequest({ items: [{ id: '1', text: 'hello', language: 'vi' }], provider: 'google_tts' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if items missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const res = await POST(makeRequest({ provider: 'google_tts' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if items empty', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const res = await POST(makeRequest({ items: [], provider: 'google_tts' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if provider invalid', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const res = await POST(makeRequest({ items: [{ id: '1', text: 'hello', language: 'vi' }], provider: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if elevenlabs without BYOK key', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserApiKey.mockResolvedValue(null)
    const res = await POST(makeRequest({ items: [{ id: '1', text: 'hello', language: 'vi' }], provider: 'elevenlabs' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('ElevenLabs')
  })

  it('returns dedup results when all items have existing audio', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const existingAsset = { id: 'asset-1', contentHash: 'hash_xin chào_vi_google_tts' }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_xin chào_vi_google_tts', existingAsset]]))
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'xin chào', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dedup_count).toBe(1)
    expect(data.generated_count).toBe(0)
    expect(data.results[0].source).toBe('dedup')
    expect(data.results[0].status).toBe('ok')
  })

  it('generates audio for items without existing assets', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({ storageType: 'r2', storageRef: 'r2:hash123' })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-new', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dedup_count).toBe(0)
    expect(data.generated_count).toBe(1)
    expect(data.results[0].source).toBe('generated')
    expect(data.results[0].status).toBe('ok')
    expect(mockGoogleTTS).toHaveBeenCalledWith('hello', 'vi')
    expect(mockUploadAudio).toHaveBeenCalled()
    expect(mockCreateMediaAsset).toHaveBeenCalled()
  })

  it('handles generation failure gracefully', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue(null) // Generation fails

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.results[0].status).toBe('error')
    expect(data.results[0].error).toBe('Generation failed')
  })

  it('handles mixed dedup and generation', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const existingAsset = { id: 'asset-existing', contentHash: 'hash_hello_vi_google_tts' }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_hello_vi_google_tts', existingAsset]]))
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio'), sizeBytes: 5 })
    mockUploadAudio.mockResolvedValue({ storageType: 'r2', storageRef: 'r2:new' })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-new', contentHash: 'hash_world_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [
        { id: 'item-1', text: 'hello', language: 'vi' },
        { id: 'item-2', text: 'world', language: 'vi' },
      ],
      provider: 'google_tts',
    }))

    const data = await res.json()
    expect(data.dedup_count).toBe(1)
    expect(data.generated_count).toBe(1)
    expect(data.results[0].source).toBe('dedup')
    expect(data.results[1].source).toBe('generated')
  })

  it('respects max items limit', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const items = Array.from({ length: 201 }, (_, i) => ({ id: `item-${i}`, text: `word-${i}`, language: 'vi' }))
    const res = await POST(makeRequest({ items, provider: 'google_tts' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('200')
  })
})

describe('GET /api/audio/[hash]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 if asset not found', async () => {
    mockFindMediaByHash.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })
    expect(res.status).toBe(404)
  })

  it('returns asset metadata for local dev', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'r2',
      storageRef: 'local:abc123',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.content_hash).toBe('abc123')
    expect(data.language).toBe('vi')
  })
})
