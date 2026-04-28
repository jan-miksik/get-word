import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Reown/wagmi hooks before importing useAuth
const mockOpen = vi.fn()
const mockDisconnect = vi.fn()
const mockFetch = vi.fn()
let mockIsConnected = false
let mockAddress: string | undefined = undefined
let mockStatus: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | undefined = 'disconnected'
let mockEmbeddedWalletInfo:
  | { user?: { email?: string; type?: string; loginMethod?: string } }
  | undefined = undefined

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: mockOpen }),
  useAppKitAccount: () => ({
    isConnected: mockIsConnected,
    address: mockAddress,
    embeddedWalletInfo: mockEmbeddedWalletInfo,
    status: mockStatus,
  }),
  useDisconnect: () => ({ disconnect: mockDisconnect }),
}))

// Must import after mocks
import { useAuth } from '../useAuth'
import { renderHook } from '@testing-library/react'

describe('useAuth', () => {
  beforeEach(() => {
    mockIsConnected = false
    mockAddress = undefined
    mockStatus = 'disconnected'
    mockEmbeddedWalletInfo = undefined
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('returns disconnected state by default', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBeUndefined()
    expect(result.current.email).toBeUndefined()
    expect(result.current.authProvider).toBeUndefined()
    expect(result.current.status).toBe('disconnected')
    expect(result.current.isAuthLoading).toBe(false)
  })

  it('returns connected state with address', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    mockStatus = 'connected'
    const { result } = renderHook(() => useAuth())
    expect(result.current.isConnected).toBe(true)
    expect(result.current.address).toBe('0xABC123')
    expect(result.current.status).toBe('connected')
  })

  it('reports loading while reconnecting a persisted wallet session', () => {
    mockStatus = 'reconnecting'
    const { result } = renderHook(() => useAuth())
    expect(result.current.isAuthLoading).toBe(true)
  })

  it('treats an unknown initial status as loading', () => {
    mockStatus = undefined
    const { result } = renderHook(() => useAuth())
    expect(result.current.status).toBe('reconnecting')
    expect(result.current.isAuthLoading).toBe(true)
  })

  it('returns email from embedded wallet info', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    mockStatus = 'connected'
    mockEmbeddedWalletInfo = { user: { email: 'user@example.com' } }
    const { result } = renderHook(() => useAuth())
    expect(result.current.email).toBe('user@example.com')
  })

  it('returns auth provider from embedded wallet info', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    mockStatus = 'connected'
    mockEmbeddedWalletInfo = { user: { email: 'user@example.com', type: 'apple' } }
    const { result } = renderHook(() => useAuth())
    expect(result.current.authProvider).toBe('apple')
  })

  it('signIn calls appKit.open', () => {
    mockOpen.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth())
    result.current.signIn()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })
  })

  it('signOut calls disconnect', async () => {
    const { result } = renderHook(() => useAuth())
    await result.current.signOut()
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('openAccountMenu calls appKit.open', () => {
    mockOpen.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth())
    result.current.openAccountMenu()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })
  })

  it('openAccountMenu opens account view when connected', () => {
    mockIsConnected = true
    mockStatus = 'connected'
    mockOpen.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth())
    result.current.openAccountMenu()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Account' })
  })

  it('catches modal open errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockOpen.mockRejectedValue(new Error('popup blocked'))
    const { result } = renderHook(() => useAuth())

    result.current.signIn()
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledWith(
      '[useAuth] Failed to open AppKit connect modal:',
      expect.any(Error)
    )

    consoleError.mockRestore()
  })
})
