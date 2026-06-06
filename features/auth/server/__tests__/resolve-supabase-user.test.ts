import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserBySupabaseAuthId = vi.fn()
const mockGetUserByEmail = vi.fn()
const mockGetUserByDeviceId = vi.fn()
const mockCreateUser = vi.fn()
const mockUpdateUserFields = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserBySupabaseAuthId: (...a: unknown[]) => mockGetUserBySupabaseAuthId(...a),
  getUserByEmail: (...a: unknown[]) => mockGetUserByEmail(...a),
  getUserByDeviceId: (...a: unknown[]) => mockGetUserByDeviceId(...a),
  createUser: (...a: unknown[]) => mockCreateUser(...a),
  updateUserFields: (...a: unknown[]) => mockUpdateUserFields(...a),
}))

import { resolveAndAttachSupabaseUser } from '../resolve-supabase-user'

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    deviceId: null,
    supabaseAuthId: null,
    email: null,
    walletAddress: null,
    authProvider: null,
    userRole: 'user',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUserBySupabaseAuthId.mockResolvedValue(null)
  mockGetUserByEmail.mockResolvedValue(null)
  mockGetUserByDeviceId.mockResolvedValue(null)
  // updateUserFields returns the merged row by default
  mockUpdateUserFields.mockImplementation(async (id: string, patch: Record<string, unknown>) =>
    user({ id, ...patch })
  )
})

describe('resolveAndAttachSupabaseUser', () => {
  it('returns the existing user matched by supabase_auth_id without creating rows', async () => {
    const existing = user({ id: 'editor', supabaseAuthId: 'sb-1', email: 'a@b.com', userRole: 'editor' })
    mockGetUserBySupabaseAuthId.mockResolvedValue(existing)

    const result = await resolveAndAttachSupabaseUser({ supabaseAuthId: 'sb-1' })

    expect(result.id).toBe('editor')
    expect(result.userRole).toBe('editor')
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('attaches supabase_auth_id to the pre-existing editor account matched by email, preserving role', async () => {
    const editor = user({ id: 'editor', email: 'jan@example.com', userRole: 'editor', deviceId: 'dev-x' })
    mockGetUserByEmail.mockResolvedValue(editor)
    // updateUserFields returns the full row (original + patch), preserving role.
    mockUpdateUserFields.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...editor,
      ...patch,
    }))

    const result = await resolveAndAttachSupabaseUser({
      supabaseAuthId: 'sb-new',
      email: 'jan@example.com',
      authProvider: 'google',
    })

    // No new row, no delete: just an attach UPDATE on the editor row.
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockUpdateUserFields).toHaveBeenCalledWith(
      'editor',
      expect.objectContaining({ supabaseAuthId: 'sb-new', authProvider: 'google' })
    )
    // email already present -> not overwritten
    expect(mockUpdateUserFields.mock.calls[0][1]).not.toHaveProperty('email')
    expect(result.userRole).toBe('editor')
    expect(result.deviceId).toBe('dev-x')
  })

  it('claims a device-only user (by deviceId) without merging or deleting', async () => {
    const deviceUser = user({ id: 'dev-user', deviceId: 'dev-123' })
    mockGetUserByDeviceId.mockResolvedValue(deviceUser)

    const result = await resolveAndAttachSupabaseUser({
      supabaseAuthId: 'sb-2',
      email: 'new@user.com',
      authProvider: 'email',
      deviceId: 'dev-123',
    })

    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockUpdateUserFields).toHaveBeenCalledWith(
      'dev-user',
      expect.objectContaining({ supabaseAuthId: 'sb-2', email: 'new@user.com', authProvider: 'email' })
    )
    expect(result.id).toBe('dev-user')
  })

  it('creates a new user when nothing matches', async () => {
    mockCreateUser.mockResolvedValue(user({ id: 'created', supabaseAuthId: 'sb-3', email: 'fresh@user.com' }))

    const result = await resolveAndAttachSupabaseUser({
      supabaseAuthId: 'sb-3',
      email: 'fresh@user.com',
      authProvider: 'email',
      deviceId: 'dev-fresh',
    })

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseAuthId: 'sb-3',
        email: 'fresh@user.com',
        authProvider: 'email',
        deviceId: 'dev-fresh',
      })
    )
    expect(result.id).toBe('created')
  })

  it('does not overwrite an existing different email when attaching', async () => {
    const existing = user({ id: 'u', supabaseAuthId: 'sb-9', email: 'old@kept.com' })
    mockGetUserBySupabaseAuthId.mockResolvedValue(existing)

    await resolveAndAttachSupabaseUser({ supabaseAuthId: 'sb-9', email: 'different@new.com' })

    // supabase_auth_id already matches and email is present -> no update needed.
    expect(mockUpdateUserFields).not.toHaveBeenCalled()
  })

  it('throws when supabaseAuthId is missing', async () => {
    await expect(resolveAndAttachSupabaseUser({ supabaseAuthId: '' })).rejects.toThrow()
  })
})
