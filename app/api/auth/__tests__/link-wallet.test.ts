import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock all DB functions used by the route
const mockGetUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()
const mockGetUserByWalletAddress = vi.fn()
const mockLinkAccountToUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockMergeUserData = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertMemoryHooks = vi.fn()
const mockSetUserCategoryFilters = vi.fn()
const mockUpdateUserFields = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserByDeviceId: (...args: unknown[]) => mockGetUserByDeviceId(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getUserByWalletAddress: (...args: unknown[]) => mockGetUserByWalletAddress(...args),
  linkAccountToUser: (...args: unknown[]) => mockLinkAccountToUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  mergeUserData: (...args: unknown[]) => mockMergeUserData(...args),
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  batchUpsertMemoryHooks: (...args: unknown[]) => mockBatchUpsertMemoryHooks(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  updateUserFields: (...args: unknown[]) => mockUpdateUserFields(...args),
}))

import { POST } from '../../auth/link-wallet/route'

// Valid Ethereum address for tests
const VALID_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/auth/link-wallet', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/link-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockUpdateUserFields.mockResolvedValue(null)
  })

  it('returns 400 if deviceId missing', async () => {
    const res = await POST(makeRequest({ walletAddress: VALID_WALLET }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
  })

  it('returns 400 if walletAddress missing', async () => {
    const res = await POST(makeRequest({ deviceId: 'dev-123' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
  })

  it('returns 400 if walletAddress format is invalid', async () => {
    mockGetUserByDeviceId.mockResolvedValue({ id: 'uuid-A' })
    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: 'not-a-wallet' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Invalid wallet address/)
  })

  it('returns 404 if device has no user', async () => {
    mockGetUserByDeviceId.mockResolvedValue(null)
    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.success).toBe(false)
  })

  it('fresh link: adds wallet to current user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const linkedUser = { ...user, walletAddress: VALID_WALLET }
    mockGetUserByDeviceId.mockResolvedValueOnce(user).mockResolvedValueOnce(linkedUser)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockLinkAccountToUser.mockResolvedValue(linkedUser)

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(mockLinkAccountToUser).toHaveBeenCalledWith('uuid-A', { walletAddress: VALID_WALLET, email: undefined, authProvider: undefined })
  })

  it('idempotent: returns data if wallet already linked to same user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: VALID_WALLET, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    mockGetUserByDeviceId.mockResolvedValue(user)

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockLinkAccountToUser).not.toHaveBeenCalled()
  })

  it('merge: merges users when wallet belongs to different user', async () => {
    const currentUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const existingUser = { id: 'uuid-B', deviceId: 'dev-456', walletAddress: VALID_WALLET, email: null, authProvider: null, role: 'cz', showEnglish: false, showCategoryBadges: true }

    mockGetUserByDeviceId.mockResolvedValue(currentUser)
    mockGetUserByWalletAddress.mockResolvedValue(existingUser)
    mockGetUserById.mockResolvedValue(existingUser)
    mockMergeUserData.mockReturnValue({
      mergedProgress: {},
      mergedHooks: {},
      mergedFilters: [],
    })

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.merged).toBe(true)
    expect(data.user.id).toBe('uuid-B')
    expect(mockDeleteUser).toHaveBeenCalledWith('uuid-A')
    expect(mockMergeUserData).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceProgress: expect.any(Object),
        targetProgress: expect.any(Object),
        sourceHooks: expect.any(Object),
        targetHooks: expect.any(Object),
      })
    )
    expect(mockUpdateUserFields).toHaveBeenCalledWith('uuid-B', expect.objectContaining({
      deviceId: 'dev-123',
      role: 'vi',
    }))
  })

  it('returns 500 if body is malformed JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/link-wallet', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
