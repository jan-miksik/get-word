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
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  MAGIC_ACCOUNT_ACCESS_DENIED_EVENT,
  MAGIC_ACCOUNT_ACCESS_DENIED_FLAG,
} from '@/lib/magic-rpc'

describe('useAuth', () => {
  beforeEach(() => {
    mockIsConnected = false
    mockAddress = undefined
    mockStatus = 'disconnected'
    mockEmbeddedWalletInfo = undefined
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true })
    localStorage.clear()
    delete (window as typeof window & Partial<Record<typeof MAGIC_ACCOUNT_ACCESS_DENIED_FLAG, number>>)[
      MAGIC_ACCOUNT_ACCESS_DENIED_FLAG
    ]
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

  it('treats an unknown initial status as disconnected', () => {
    mockStatus = undefined
    const { result } = renderHook(() => useAuth())
    expect(result.current.status).toBe('disconnected')
    expect(result.current.isAuthLoading).toBe(false)
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

  it('signIn opens AppKit connect modal without clearing a reusable provider session', async () => {
    mockOpen.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth())
    result.current.signIn()
    expect(mockDisconnect).not.toHaveBeenCalled()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })
  })

  it('signIn clears stale wallet state when reconnecting before opening AppKit connect modal', async () => {
    mockStatus = 'reconnecting'
    mockOpen.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth())
    result.current.signIn()
    expect(mockDisconnect).toHaveBeenCalled()
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })
    })
  })

  it('signOut calls disconnect', async () => {
    localStorage.setItem('get_word_device_id', 'device-123')
    const { result } = renderHook(() => useAuth())
    await result.current.signOut()
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'device-123' }),
    })
    expect(localStorage.getItem('get_word_device_id')).toBeNull()
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
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })
    })
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledWith(
      '[useAuth] Failed to open AppKit connect modal:',
      expect.any(Error)
    )

    consoleError.mockRestore()
  })

  it('clears a stale reconnect when Magic denies account access', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockStatus = 'reconnecting'
    mockOpen.mockResolvedValue(undefined)
    localStorage.setItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY', 'true')
    const { unmount } = renderHook(() => useAuth())

    act(() => {
      window.dispatchEvent(new CustomEvent(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT))
    })

    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })
    expect(localStorage.getItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY')).toBeNull()

    unmount()
    consoleWarn.mockRestore()
  })

  it('clears a stale connect attempt when Magic denies account access', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockStatus = 'connecting'
    mockOpen.mockResolvedValue(undefined)
    const { unmount } = renderHook(() => useAuth())

    act(() => {
      window.dispatchEvent(new CustomEvent(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT))
    })

    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })

    unmount()
    consoleWarn.mockRestore()
  })

  it('clears a stale connect attempt when Magic denied access before auth mounted', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockStatus = 'connecting'
    mockOpen.mockResolvedValue(undefined)
    ;(window as typeof window & Record<typeof MAGIC_ACCOUNT_ACCESS_DENIED_FLAG, number>)[
      MAGIC_ACCOUNT_ACCESS_DENIED_FLAG
    ] = Date.now()

    const { unmount } = renderHook(() => useAuth())

    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })

    unmount()
    consoleWarn.mockRestore()
  })

  it('times out a stale connecting wallet session', async () => {
    vi.useFakeTimers()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockStatus = 'connecting'
    mockOpen.mockResolvedValue(undefined)
    const { unmount } = renderHook(() => useAuth())

    await act(async () => {
      vi.advanceTimersByTime(8000)
    })

    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockOpen).toHaveBeenCalledWith({ view: 'Connect' })

    unmount()
    consoleWarn.mockRestore()
    vi.useRealTimers()
  })

  it('does not reopen the connect modal for explicit Magic denials outside provider waits', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockStatus = 'disconnected'
    localStorage.setItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY', 'true')
    const { unmount } = renderHook(() => useAuth())

    act(() => {
      window.dispatchEvent(new CustomEvent(MAGIC_ACCOUNT_ACCESS_DENIED_EVENT))
    })

    expect(mockDisconnect).not.toHaveBeenCalled()
    expect(mockOpen).not.toHaveBeenCalled()
    expect(localStorage.getItem('@appkit-wallet/EMAIL_LOGIN_USED_KEY')).toBeNull()

    unmount()
    consoleWarn.mockRestore()
  })
})
