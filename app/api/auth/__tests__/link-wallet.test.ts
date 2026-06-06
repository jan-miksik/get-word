import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../link-wallet/route'
import { GET_WORD_SESSION_COOKIE_NAME } from '@/lib/session'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/auth/link-wallet', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/link-wallet (disabled)', () => {
  it('returns 410 and never mints a session', async () => {
    const response = await POST(
      makeRequest({
        deviceId: 'dev-1',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        email: 'victim@example.com',
      })
    )

    expect(response.status).toBe(410)
    const body = await response.json()
    expect(body.success).toBe(false)
    // Critical: no app session cookie is ever set by this route anymore.
    expect(response.cookies.get(GET_WORD_SESSION_COOKIE_NAME)).toBeUndefined()
  })
})
