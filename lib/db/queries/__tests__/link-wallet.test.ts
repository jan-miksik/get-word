import { describe, it, expect, vi } from 'vitest'

// Mock the DB client to prevent DATABASE_URL errors
vi.mock('../../client', () => ({ db: {} }))

import { mergeUserData, type MergeInput } from '../users'

describe('mergeUserData', () => {
  it('merges progress keeping highest stageIndex per word', () => {
    const input: MergeInput = {
      sourceProgress: {
        w001: { stageIndex: 3, knownCount: 5, unknownCount: 1, lastKnownAt: new Date('2026-01-15'), lastUnknownAt: null, nextDueAt: new Date('2026-01-20') },
        w002: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: new Date('2026-01-10'), lastUnknownAt: null, nextDueAt: new Date('2026-01-11') },
      },
      targetProgress: {
        w001: { stageIndex: 5, knownCount: 8, unknownCount: 2, lastKnownAt: new Date('2026-01-20'), lastUnknownAt: new Date('2026-01-18'), nextDueAt: new Date('2026-01-25') },
        w003: { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: new Date('2026-01-12'), lastUnknownAt: null, nextDueAt: new Date('2026-01-14') },
      },
      sourceHooks: { w001: 'source hook for w001', w002: 'source hook for w002' },
      targetHooks: { w001: 'target hook for w001' },
      sourceFilters: ['basic', 'food'],
      targetFilters: ['basic', 'travel'],
    }

    const result = mergeUserData(input)

    // w001: target wins (stageIndex 5 > 3)
    expect(result.mergedProgress.w001.stageIndex).toBe(5)
    expect(result.mergedProgress.w001.knownCount).toBe(8)

    // w002: only in source, keep as-is
    expect(result.mergedProgress.w002.stageIndex).toBe(1)

    // w003: only in target, keep as-is
    expect(result.mergedProgress.w003.stageIndex).toBe(2)

    // Hooks: target wins for w001 (already has one), source w002 is new
    expect(result.mergedHooks.w001).toBe('target hook for w001')
    expect(result.mergedHooks.w002).toBe('source hook for w002')

    // Filters: union
    expect(result.mergedFilters.sort()).toEqual(['basic', 'food', 'travel'])
  })

  it('source wins when it has higher stageIndex', () => {
    const input: MergeInput = {
      sourceProgress: {
        w001: { stageIndex: 7, knownCount: 10, unknownCount: 0, lastKnownAt: new Date('2026-01-20'), lastUnknownAt: null, nextDueAt: new Date('2026-02-01') },
      },
      targetProgress: {
        w001: { stageIndex: 3, knownCount: 4, unknownCount: 1, lastKnownAt: new Date('2026-01-15'), lastUnknownAt: new Date('2026-01-14'), nextDueAt: new Date('2026-01-18') },
      },
      sourceHooks: {},
      targetHooks: {},
      sourceFilters: [],
      targetFilters: [],
    }

    const result = mergeUserData(input)
    expect(result.mergedProgress.w001.stageIndex).toBe(7)
    expect(result.mergedProgress.w001.knownCount).toBe(10)
  })

  it('handles empty source gracefully', () => {
    const input: MergeInput = {
      sourceProgress: {},
      targetProgress: { w001: { stageIndex: 3, knownCount: 3, unknownCount: 0, lastKnownAt: null, lastUnknownAt: null, nextDueAt: null } },
      sourceHooks: {},
      targetHooks: { w001: 'hook' },
      sourceFilters: [],
      targetFilters: ['basic'],
    }

    const result = mergeUserData(input)
    expect(result.mergedProgress.w001.stageIndex).toBe(3)
    expect(result.mergedHooks.w001).toBe('hook')
    expect(result.mergedFilters).toEqual(['basic'])
  })

  it('handles empty target gracefully', () => {
    const input: MergeInput = {
      sourceProgress: { w001: { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: null, lastUnknownAt: null, nextDueAt: null } },
      targetProgress: {},
      sourceHooks: { w001: 'hook' },
      targetHooks: {},
      sourceFilters: ['food'],
      targetFilters: [],
    }

    const result = mergeUserData(input)
    expect(result.mergedProgress.w001.stageIndex).toBe(2)
    expect(result.mergedHooks.w001).toBe('hook')
    expect(result.mergedFilters).toEqual(['food'])
  })
})
