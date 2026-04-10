import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock all DB functions used by the route
const mockGetUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()
const mockGetUserByEmail = vi.fn()
const mockGetUserByWalletAddress = vi.fn()
const mockCreateUser = vi.fn()
const mockLinkAccountToUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockMergeUserData = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertProgressByItemId = vi.fn()
const mockBatchUpsertMemoryHooks = vi.fn()
const mockSetUserCategoryFilters = vi.fn()
const mockUpdateUserFields = vi.fn()
const mockGetUserSubscribedItems = vi.fn()
const mockGetUserOwnListItems = vi.fn()
const mockGetListCategories = vi.fn()
const mockGetSystemDefaultList = vi.fn()
const mockGetWordIdToItemIdMapping = vi.fn()
const mockGetWordListsByIds = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserByDeviceId: (...args: unknown[]) => mockGetUserByDeviceId(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getUserByEmail: (...args: unknown[]) => mockGetUserByEmail(...args),
  getUserByWalletAddress: (...args: unknown[]) => mockGetUserByWalletAddress(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  linkAccountToUser: (...args: unknown[]) => mockLinkAccountToUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  mergeUserData: (...args: unknown[]) => mockMergeUserData(...args),
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  batchUpsertProgressByItemId: (...args: unknown[]) => mockBatchUpsertProgressByItemId(...args),
  batchUpsertMemoryHooks: (...args: unknown[]) => mockBatchUpsertMemoryHooks(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  updateUserFields: (...args: unknown[]) => mockUpdateUserFields(...args),
  getUserSubscribedItems: (...args: unknown[]) => mockGetUserSubscribedItems(...args),
  getUserOwnListItems: (...args: unknown[]) => mockGetUserOwnListItems(...args),
  getListCategories: (...args: unknown[]) => mockGetListCategories(...args),
  getSystemDefaultList: (...args: unknown[]) => mockGetSystemDefaultList(...args),
  getWordIdToItemIdMapping: (...args: unknown[]) => mockGetWordIdToItemIdMapping(...args),
  getWordListsByIds: (...args: unknown[]) => mockGetWordListsByIds(...args),
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
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetListCategories.mockResolvedValue([])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map())
    mockGetWordListsByIds.mockResolvedValue([])
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

  it('creates a new user when email, wallet, and device have no match', async () => {
    const createdUser = {
      id: 'uuid-new',
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      email: null,
      authProvider: null,
      role: 'vi',
      userRole: 'user',
      showEnglish: true,
      showCategoryBadges: false,
      gameScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      showPronunciation: false,
      memoryHooksEnabled: true,
      memoryHookDisableFromStage: 8,
      categoryOrder: [],
    }
    mockGetUserByDeviceId.mockResolvedValue(null)
    mockGetUserByEmail.mockResolvedValue(null)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockCreateUser.mockResolvedValue(createdUser)

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-new')
    expect(mockCreateUser).toHaveBeenCalledWith({
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
    })
  })

  it('fresh link: adds wallet to current user', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const linkedUser = { ...user, walletAddress: VALID_WALLET }
    mockGetUserByDeviceId.mockResolvedValue(user)
    mockGetUserById.mockResolvedValue(linkedUser)
    mockGetUserByWalletAddress.mockResolvedValue(null)

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(mockUpdateUserFields).toHaveBeenCalledWith('uuid-A', {
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
    })
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
      role: 'cz',
    }))
  })

  it('merge: uses item-id upsert for UUID progress keys', async () => {
    const currentUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const existingUser = { id: 'uuid-B', deviceId: 'dev-456', walletAddress: VALID_WALLET, email: null, authProvider: null, role: 'cz', showEnglish: false, showCategoryBadges: true }
    const progressKeyUuid = '11111111-1111-1111-1111-111111111111'

    mockGetUserByDeviceId.mockResolvedValue(currentUser)
    mockGetUserByWalletAddress.mockResolvedValue(existingUser)
    mockGetUserById.mockResolvedValue(existingUser)
    mockGetUserProgress
      .mockResolvedValueOnce({ [progressKeyUuid]: { stageIndex: 2, knownCount: 1, unknownCount: 0, lastKnownAt: null, lastUnknownAt: null, nextDueAt: null } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
    mockMergeUserData.mockReturnValue({
      mergedProgress: {
        [progressKeyUuid]: {
          stageIndex: 2,
          knownCount: 1,
          unknownCount: 0,
          lastKnownAt: null,
          lastUnknownAt: null,
          nextDueAt: null,
        },
      },
      mergedHooks: {},
      mergedFilters: [],
    })

    const res = await POST(makeRequest({ deviceId: 'dev-123', walletAddress: VALID_WALLET }))
    expect(res.status).toBe(200)
    expect(mockBatchUpsertProgressByItemId).toHaveBeenCalledTimes(1)
    expect(mockBatchUpsertProgressByItemId).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'uuid-B',
        wordListItemId: progressKeyUuid,
      }),
    ])
  })

  it('email-first: clears wallet from source user before moving it to email user', async () => {
    const deviceUser = {
      id: 'uuid-A',
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      email: null,
      authProvider: null,
      role: 'vi',
      showEnglish: true,
      showCategoryBadges: false,
      gameScore: 3,
    }
    const emailUser = {
      id: 'uuid-B',
      deviceId: 'dev-999',
      walletAddress: null,
      email: 'user@example.com',
      authProvider: 'email',
      role: 'cz',
      showEnglish: false,
      showCategoryBadges: true,
      gameScore: 5,
    }
    const mergedUser = {
      ...emailUser,
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      gameScore: 8,
    }

    mockGetUserByDeviceId.mockResolvedValue(deviceUser)
    mockGetUserByEmail.mockResolvedValue(emailUser)
    mockGetUserByWalletAddress.mockResolvedValue(deviceUser)
    mockGetUserById.mockResolvedValue(mergedUser)

    const res = await POST(makeRequest({
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      email: 'user@example.com',
      authProvider: 'email',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-B')
    expect(mockUpdateUserFields).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({
        deviceId: null,
        walletAddress: null,
      })
    )
    expect(mockDeleteUser).toHaveBeenCalledTimes(1)
    expect(mockDeleteUser).toHaveBeenCalledWith('uuid-A')
  })

  it('email-first: resolves by email even when device id is new', async () => {
    const emailUser = {
      id: 'uuid-B',
      deviceId: 'dev-old',
      walletAddress: null,
      email: 'user@example.com',
      authProvider: 'email',
      role: 'cz',
      showEnglish: false,
      showCategoryBadges: true,
      gameScore: 5,
    }
    const linkedUser = {
      ...emailUser,
      deviceId: 'dev-new',
      walletAddress: VALID_WALLET,
    }

    mockGetUserByDeviceId.mockResolvedValue(null)
    mockGetUserByEmail.mockResolvedValue(emailUser)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockGetUserById.mockResolvedValue(linkedUser)

    const res = await POST(makeRequest({
      deviceId: 'dev-new',
      walletAddress: VALID_WALLET,
      email: 'user@example.com',
      authProvider: 'email',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-B')
    expect(mockGetUserByEmail).toHaveBeenCalledWith('user@example.com')
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

  it('email-first: when email matches existing user, merges device user into email user', async () => {
    const deviceUser = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false, gameScore: 0 }
    const emailUser = { id: 'uuid-B', deviceId: 'dev-456', walletAddress: null, email: 'user@example.com', authProvider: 'google', role: 'cz', showEnglish: false, showCategoryBadges: true, gameScore: 10 }

    mockGetUserByDeviceId.mockResolvedValue(deviceUser)
    mockGetUserByEmail.mockResolvedValue(emailUser)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockGetUserById.mockResolvedValue(emailUser)

    const res = await POST(makeRequest({
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      email: 'user@example.com',
      authProvider: 'google',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.merged).toBe(true)
    expect(data.user.id).toBe('uuid-B')
    expect(data.user.email).toBe('user@example.com')
    expect(mockGetUserByEmail).toHaveBeenCalledWith('user@example.com')
    expect(mockDeleteUser).toHaveBeenCalledWith('uuid-A')
    expect(mockLinkAccountToUser).not.toHaveBeenCalled()
  })

  it('when email has no matching user, falls back to wallet then device (fresh link to device user)', async () => {
    const user = { id: 'uuid-A', deviceId: 'dev-123', walletAddress: null, email: null, authProvider: null, role: 'vi', showEnglish: true, showCategoryBadges: false }
    const linkedUser = { ...user, walletAddress: VALID_WALLET, email: 'new@example.com' }

    mockGetUserByDeviceId.mockResolvedValue(user)
    mockGetUserByEmail.mockResolvedValue(null)
    mockGetUserByWalletAddress.mockResolvedValue(null)
    mockGetUserById.mockResolvedValue(linkedUser)

    const res = await POST(makeRequest({
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      email: 'new@example.com',
      authProvider: 'email',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.merged).toBeFalsy()
    expect(data.user.id).toBe('uuid-A')
    expect(mockGetUserByEmail).toHaveBeenCalledWith('new@example.com')
    expect(mockUpdateUserFields).toHaveBeenCalledWith('uuid-A', {
      deviceId: 'dev-123',
      walletAddress: VALID_WALLET,
      email: 'new@example.com',
      authProvider: 'email',
    })
  })
})
