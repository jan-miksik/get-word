import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock all DB functions used by the route
const mockGetUserByDeviceId = vi.fn()
const mockGetUserByWalletAddress = vi.fn()
const mockLinkWalletToUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockMergeUserData = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertMemoryHooks = vi.fn()
const mockSetUserCategoryFilters = vi.fn()
const mockDbUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserByDeviceId: (...args: unknown[]) => mockGetUserByDeviceId(...args),
  getUserByWalletAddress: (...args: unknown[]) => mockGetUserByWalletAddress(...args),
  linkWalletToUser: (...args: unknown[]) => mockLinkWalletToUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  mergeUserData: (...args: unknown[]) => mockMergeUserData(...args),
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  batchUpsertMemoryHooks: (...args: unknown[]) => mockBatchUpsertMemoryHooks(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
  users: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

// Chain mock for db.update().set().where()
mockDbUpdate.mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
})

import { POST } from '../../auth/link-wallet/route'

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
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })
  })

  it('returns 400 if deviceId missing', async () => {
    const res = await POST(makeRequest({ walletAddress: '0xABC' }))
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

  it('returns 404 if device has no user', async () => {
    mockGetUserByDeviceId.mockResolvedValue(null)
    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.success).toBe(false)
  })

  it('fresh link: adds wallet to current user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    mockGetUserByDeviceId.mockResolvedValue(user)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockLinkWalletToUser.mockResolvedValue({ ...user, walletAddress: '0xABC' })

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(mockLinkWalletToUser).toHaveBeenCalledWith('uuid-A', '0xABC')
  })

  it('idempotent: returns data if wallet already linked to same user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: '0xABC', role: 'vi', showEnglish: true, showCategoryBadges: false }
    mockGetUserByDeviceId.mockResolvedValue(user)

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockLinkWalletToUser).not.toHaveBeenCalled()
  })

  it('merge: merges users when wallet belongs to different user', async () => {
    const currentUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const existingUser = { id: 'uuid-B', deviceId: 'dev-456', walletAddress: '0xABC', role: 'cz', showEnglish: false, showCategoryBadges: true }

    mockGetUserByDeviceId.mockResolvedValue(currentUser)
    mockGetUserByWalletAddress.mockResolvedValue(existingUser)
    mockMergeUserData.mockReturnValue({
      mergedProgress: {},
      mergedHooks: {},
      mergedFilters: [],
    })

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: '0xABC' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.merged).toBe(true)
    expect(data.user.id).toBe('uuid-B')
    expect(mockDeleteUser).toHaveBeenCalledWith('uuid-A')
    expect(mockMergeUserData).toHaveBeenCalled()
  })
})
