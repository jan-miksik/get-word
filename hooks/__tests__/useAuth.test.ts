import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Reown/wagmi hooks before importing useAuth
const mockOpen = vi.fn()
const mockDisconnect = vi.fn()
let mockIsConnected = false
let mockAddress: string | undefined = undefined
let mockEmbeddedWalletInfo: { email?: string } | undefined = undefined

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: mockOpen }),
  useAppKitAccount: () => ({
    isConnected: mockIsConnected,
    address: mockAddress,
    embeddedWalletInfo: mockEmbeddedWalletInfo,
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
    mockEmbeddedWalletInfo = undefined
    vi.clearAllMocks()
  })

  it('returns disconnected state by default', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.address).toBeUndefined()
    expect(result.current.email).toBeUndefined()
  })

  it('returns connected state with address', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    const { result } = renderHook(() => useAuth())
    expect(result.current.isConnected).toBe(true)
    expect(result.current.address).toBe('0xABC123')
  })

  it('returns email from embedded wallet info', () => {
    mockIsConnected = true
    mockAddress = '0xABC123'
    mockEmbeddedWalletInfo = { email: 'user@example.com' }
    const { result } = renderHook(() => useAuth())
    expect(result.current.email).toBe('user@example.com')
  })

  it('signIn calls appKit.open', () => {
    const { result } = renderHook(() => useAuth())
    result.current.signIn()
    expect(mockOpen).toHaveBeenCalled()
  })

  it('signOut calls disconnect', () => {
    const { result } = renderHook(() => useAuth())
    result.current.signOut()
    expect(mockDisconnect).toHaveBeenCalled()
  })
})
