export const MAGIC_ACCOUNT_ACCESS_DENIED_EVENT =
  'get-word:magic-account-access-denied'
export const MAGIC_ACCOUNT_ACCESS_DENIED_FLAG =
  '__getWordMagicAccountAccessDeniedAt'

const RECENT_DENIAL_WINDOW_MS = 30_000

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function addValue(parts: string[], value: unknown) {
  if (typeof value === 'string' && value.length > 0) {
    parts.push(value)
    return
  }

  if (typeof value === 'number') {
    parts.push(String(value))
  }
}

function collectErrorText(value: unknown, parts: string[], seen: WeakSet<object>) {
  addValue(parts, value)

  if (!isRecord(value)) {
    return
  }

  if (seen.has(value)) {
    return
  }
  seen.add(value)

  addValue(parts, value.name)
  addValue(parts, value.message)
  addValue(parts, value.code)
  addValue(parts, value.stack)

  const toString = value.toString
  if (typeof toString === 'function') {
    try {
      const stringified = toString.call(value)
      if (stringified !== '[object Object]') {
        addValue(parts, stringified)
      }
    } catch {
      // Some SDK objects expose a throwing custom toString; skip it.
    }
  }

  collectErrorText(value.error, parts, seen)
  collectErrorText(value.reason, parts, seen)
  collectErrorText(value.data, parts, seen)
  collectErrorText(value.body, parts, seen)
}

export function isMagicAccountAccessDeniedError(reason: unknown): boolean {
  const parts: string[] = []
  collectErrorText(reason, parts, new WeakSet())

  const text = parts.join('\n')
  const hasDeniedAccountAccess = /user denied account access/i.test(text)
  const hasMagicRpc = /magic rpc error/i.test(text)
  const hasInternalRpcCode = /-32603/.test(text)

  return hasDeniedAccountAccess || (hasMagicRpc && hasInternalRpcCode)
}

export function markMagicAccountAccessDenied() {
  if (typeof window === 'undefined') {
    return
  }

  ;(window as typeof window & Record<typeof MAGIC_ACCOUNT_ACCESS_DENIED_FLAG, number>)[
    MAGIC_ACCOUNT_ACCESS_DENIED_FLAG
  ] = Date.now()
}

export function hasRecentMagicAccountAccessDenied(
  maxAgeMs = RECENT_DENIAL_WINDOW_MS
): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const deniedAt = (window as typeof window &
    Partial<Record<typeof MAGIC_ACCOUNT_ACCESS_DENIED_FLAG, unknown>>)[
    MAGIC_ACCOUNT_ACCESS_DENIED_FLAG
  ]

  return typeof deniedAt === 'number' && Date.now() - deniedAt <= maxAgeMs
}
