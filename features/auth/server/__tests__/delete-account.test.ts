import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserById = vi.fn()
const mockDeleteUser = vi.fn()
const mockDeleteList = vi.fn()
const mockSetListOwnerNullAndScrub = vi.fn()
const mockGetOwnedLists = vi.fn()
const mockCreatePendingJob = vi.fn()
const mockDeleteJob = vi.fn()
const mockBumpJob = vi.fn()

// Sentinel passed to `db.transaction(cb)` so we can assert tx-aware queries
// received the transaction handle (not the global db).
const TX = Symbol('tx-handle')

vi.mock('@/lib/db', () => ({
  db: { transaction: (cb: (tx: unknown) => unknown) => cb(TX) },
  getUserById: (...a: unknown[]) => mockGetUserById(...a),
  deleteUser: (...a: unknown[]) => mockDeleteUser(...a),
  deleteList: (...a: unknown[]) => mockDeleteList(...a),
  setListOwnerNullAndScrub: (...a: unknown[]) => mockSetListOwnerNullAndScrub(...a),
  getOwnedListsWithSubscriberCounts: (...a: unknown[]) => mockGetOwnedLists(...a),
  createPendingAccountDeletionJob: (...a: unknown[]) => mockCreatePendingJob(...a),
  deleteAccountDeletionJob: (...a: unknown[]) => mockDeleteJob(...a),
  bumpAccountDeletionJobAttempt: (...a: unknown[]) => mockBumpJob(...a),
}))

const mockDeleteSupabaseAuthUser = vi.fn()
vi.mock('@/features/auth/supabase/admin', () => ({
  deleteSupabaseAuthUser: (...a: unknown[]) => mockDeleteSupabaseAuthUser(...a),
}))

const mockRevokeAppleRefreshToken = vi.fn()
vi.mock('../apple-token', () => ({
  revokeAppleRefreshToken: (...a: unknown[]) => mockRevokeAppleRefreshToken(...a),
}))

vi.mock('@/lib/providers/crypto', () => ({
  decryptProviderSecret: (cipherText: string) => ({
    secret: cipherText.replace('encrypted:', ''),
    wasEncrypted: true,
  }),
}))

import { deleteAccount } from '../delete-account'

const SUPA_ID = 'supabase-auth-1'

function ownedList(over: Partial<{
  listId: string
  subscriberCount: number
  isRecommended: boolean
  isCommon: boolean
  isPublic: boolean
}>) {
  return {
    listId: over.listId ?? 'list-x',
    name: 'List',
    description: 'desc',
    isPublic: over.isPublic ?? false,
    isRecommended: over.isRecommended ?? false,
    isCommon: over.isCommon ?? false,
    subscriberCount: over.subscriberCount ?? 0,
  }
}

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Async query helpers return promises in production; default the mocks so
    // awaited / `.catch()`-chained calls behave.
    mockDeleteUser.mockResolvedValue(true)
    mockDeleteList.mockResolvedValue(true)
    mockSetListOwnerNullAndScrub.mockResolvedValue(undefined)
    mockCreatePendingJob.mockResolvedValue(undefined)
    mockDeleteJob.mockResolvedValue(undefined)
    mockBumpJob.mockResolvedValue(undefined)
  })

  it('is idempotent: missing user reports deleted and runs no transaction', async () => {
    mockGetUserById.mockResolvedValue(null)
    const result = await deleteAccount('gone')
    expect(result).toEqual({ status: 'deleted' })
    expect(mockGetOwnedLists).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('partitions owned lists: deletes private/public-no-sub, keeps+anonymizes subscribed/recommended', async () => {
    mockGetUserById.mockResolvedValue({ id: 'u1', supabaseAuthId: SUPA_ID })
    mockGetOwnedLists.mockResolvedValue([
      ownedList({ listId: 'a-private', isPublic: false, subscriberCount: 0 }),
      ownedList({ listId: 'b-public-nosub', isPublic: true, subscriberCount: 0 }),
      ownedList({ listId: 'c-public-sub', isPublic: true, subscriberCount: 3 }),
      ownedList({ listId: 'd-recommended', isRecommended: true, subscriberCount: 0 }),
    ])
    mockDeleteSupabaseAuthUser.mockResolvedValue(undefined)

    const result = await deleteAccount('u1')

    expect(result).toEqual({ status: 'deleted' })
    // delete-set
    expect(mockDeleteList).toHaveBeenCalledWith('a-private', TX)
    expect(mockDeleteList).toHaveBeenCalledWith('b-public-nosub', TX)
    expect(mockDeleteList).toHaveBeenCalledTimes(2)
    // keep-set anonymized (owner_id NULL + description scrub), passed the tx
    expect(mockSetListOwnerNullAndScrub).toHaveBeenCalledWith('c-public-sub', TX)
    expect(mockSetListOwnerNullAndScrub).toHaveBeenCalledWith('d-recommended', TX)
    expect(mockSetListOwnerNullAndScrub).toHaveBeenCalledTimes(2)
    // user erased and lock requested
    expect(mockDeleteUser).toHaveBeenCalledWith('u1', TX)
    expect(mockGetOwnedLists).toHaveBeenCalledWith('u1', TX, { lock: true })
  })

  it('treats an owner-only subscriber count (0 after exclusion) as deletable', async () => {
    mockGetUserById.mockResolvedValue({ id: 'u1', supabaseAuthId: SUPA_ID })
    // getOwnedListsWithSubscriberCounts already excludes the owner, so an
    // owner-only list arrives here with subscriberCount 0 → delete, not keep.
    mockGetOwnedLists.mockResolvedValue([
      ownedList({ listId: 'owner-only', isPublic: true, subscriberCount: 0 }),
    ])
    mockDeleteSupabaseAuthUser.mockResolvedValue(undefined)

    await deleteAccount('u1')

    expect(mockDeleteList).toHaveBeenCalledWith('owner-only', TX)
    expect(mockSetListOwnerNullAndScrub).not.toHaveBeenCalled()
  })

  it('device-only user (no supabaseAuthId): no job, no admin call, status deleted', async () => {
    mockGetUserById.mockResolvedValue({ id: 'u1', supabaseAuthId: null })
    mockGetOwnedLists.mockResolvedValue([])

    const result = await deleteAccount('u1')

    expect(result).toEqual({ status: 'deleted' })
    expect(mockCreatePendingJob).not.toHaveBeenCalled()
    expect(mockDeleteSupabaseAuthUser).not.toHaveBeenCalled()
  })

  it('crash-window: pending job is created inside the tx before the user delete', async () => {
    mockGetUserById.mockResolvedValue({ id: 'u1', supabaseAuthId: SUPA_ID })
    mockGetOwnedLists.mockResolvedValue([])
    mockDeleteSupabaseAuthUser.mockResolvedValue(undefined)

    await deleteAccount('u1')

    expect(mockCreatePendingJob).toHaveBeenCalledWith(SUPA_ID, TX)
    const jobOrder = mockCreatePendingJob.mock.invocationCallOrder[0]
    const deleteUserOrder = mockDeleteUser.mock.invocationCallOrder[0]
    expect(jobOrder).toBeLessThan(deleteUserOrder)
  })

  it('Supabase success: clears the job and reports deleted', async () => {
    mockGetUserById.mockResolvedValue({ id: 'u1', supabaseAuthId: SUPA_ID })
    mockGetOwnedLists.mockResolvedValue([])
    mockDeleteSupabaseAuthUser.mockResolvedValue(undefined)

    const result = await deleteAccount('u1')

    expect(result).toEqual({ status: 'deleted' })
    expect(mockDeleteSupabaseAuthUser).toHaveBeenCalledWith(SUPA_ID)
    expect(mockDeleteJob).toHaveBeenCalledWith(SUPA_ID)
    expect(mockBumpJob).not.toHaveBeenCalled()
  })

  it('Supabase failure: leaves job pending, bumps attempt, reports completing', async () => {
    mockGetUserById.mockResolvedValue({ id: 'u1', supabaseAuthId: SUPA_ID })
    mockGetOwnedLists.mockResolvedValue([])
    mockDeleteSupabaseAuthUser.mockRejectedValue(new Error('supabase down'))

    const result = await deleteAccount('u1')

    expect(result).toEqual({ status: 'completing' })
    expect(mockDeleteJob).not.toHaveBeenCalled()
    expect(mockBumpJob).toHaveBeenCalledWith(SUPA_ID, expect.stringContaining('supabase down'))
  })
  it('revokes the Apple refresh token, as Sign in with Apple requires', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      supabaseAuthId: SUPA_ID,
      appleRefreshToken: 'encrypted:apple-refresh-1',
    })
    mockGetOwnedLists.mockResolvedValue([])
    mockDeleteSupabaseAuthUser.mockResolvedValue(undefined)

    const result = await deleteAccount('u1')

    expect(mockRevokeAppleRefreshToken).toHaveBeenCalledWith('apple-refresh-1')
    expect(result).toEqual({ status: 'deleted' })
  })

  it('does not call Apple for an account that never signed in with it', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      supabaseAuthId: SUPA_ID,
      appleRefreshToken: null,
    })
    mockGetOwnedLists.mockResolvedValue([])

    await deleteAccount('u1')

    expect(mockRevokeAppleRefreshToken).not.toHaveBeenCalled()
  })

  it('still completes the erasure when Apple revocation fails', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'u1',
      supabaseAuthId: SUPA_ID,
      appleRefreshToken: 'encrypted:apple-refresh-1',
    })
    mockGetOwnedLists.mockResolvedValue([])
    mockDeleteSupabaseAuthUser.mockResolvedValue(undefined)
    mockRevokeAppleRefreshToken.mockRejectedValue(new Error('apple unreachable'))

    const result = await deleteAccount('u1')

    expect(mockDeleteUser).toHaveBeenCalled()
    expect(result).toEqual({ status: 'deleted' })
  })
})
