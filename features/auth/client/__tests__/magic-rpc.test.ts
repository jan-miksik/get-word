import { describe, expect, it } from 'vitest'
import { isMagicAccountAccessDeniedError } from '../magic-rpc'

describe('isMagicAccountAccessDeniedError', () => {
  it('matches the Magic RPC account access denial from embedded-wallet reconnects', () => {
    expect(
      isMagicAccountAccessDeniedError(
        new Error(
          'Magic RPC Error: [-32603] Internal error: User denied account access.'
        )
      )
    ).toBe(true)
  })

  it('matches nested RPC error payloads', () => {
    expect(
      isMagicAccountAccessDeniedError({
        error: {
          code: -32603,
          message: 'Internal error: User denied account access.',
        },
      })
    ).toBe(true)
  })

  it('matches string-only account access denials', () => {
    expect(isMagicAccountAccessDeniedError('User denied account access.')).toBe(
      true
    )
  })

  it('does not match unrelated internal RPC errors', () => {
    expect(
      isMagicAccountAccessDeniedError({
        code: -32603,
        message: 'Internal error',
      })
    ).toBe(false)
  })
})
