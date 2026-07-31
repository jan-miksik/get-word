import { describe, it, expect } from 'vitest'
import { serializeWordList } from '../word-list-dto'

describe('serializeWordList', () => {
  it('strips share_token while preserving other fields', () => {
    const dto = serializeWordList({
      id: 'l1',
      name: 'List',
      isPublic: false,
      shareToken: 'secret-token',
      moderationNote: 'internal moderator context',
      moderationDecisionCode: 'spam_or_misleading',
      moderationPublicNote: 'This explanation is safe to show.',
    })
    expect(dto).toEqual({
      id: 'l1',
      name: 'List',
      isPublic: false,
      moderationDecisionCode: 'spam_or_misleading',
      moderationPublicNote: 'This explanation is safe to show.',
    })
    expect('shareToken' in dto).toBe(false)
    expect('moderationNote' in dto).toBe(false)
  })

  it('preserves augmented fields like isOwner and subscriberCount', () => {
    const dto = serializeWordList({
      id: 'l1',
      shareToken: 'x',
      isOwner: true,
      subscriberCount: 5,
    })
    expect(dto).toMatchObject({ id: 'l1', isOwner: true, subscriberCount: 5 })
    expect('shareToken' in dto).toBe(false)
  })
})
