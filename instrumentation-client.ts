function collectMagicErrorText(
  value: unknown,
  parts: string[],
  seen: WeakSet<object>
) {
  if (typeof value === 'string' && value.length > 0) {
    parts.push(value)
  }
  if (typeof value === 'number') {
    parts.push(String(value))
  }
  if (!value || typeof value !== 'object') {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)

  const record = value as Record<string, unknown>
  if (typeof record.name === 'string') parts.push(record.name)
  if (typeof record.message === 'string') parts.push(record.message)
  if (typeof record.code === 'number') parts.push(String(record.code))
  if (typeof record.stack === 'string') parts.push(record.stack)

  collectMagicErrorText(record.error, parts, seen)
  collectMagicErrorText(record.reason, parts, seen)
  collectMagicErrorText(record.data, parts, seen)
  collectMagicErrorText(record.body, parts, seen)
}

function isMagicAccountAccessDenied(reason: unknown) {
  const parts: string[] = []
  collectMagicErrorText(reason, parts, new WeakSet())
  const text = parts.join('\n')

  return (
    /user denied account access/i.test(text) ||
    (/magic rpc error/i.test(text) && /-32603/.test(text))
  )
}

const windowWithMagicGuard = window as typeof window & {
  __getWordMagicGuardInstalled?: boolean
  __getWordMagicAccountAccessDeniedAt?: number
}

if (!windowWithMagicGuard.__getWordMagicGuardInstalled) {
  windowWithMagicGuard.__getWordMagicGuardInstalled = true
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (!isMagicAccountAccessDenied(event.reason)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      windowWithMagicGuard.__getWordMagicAccountAccessDeniedAt = Date.now()
      window.dispatchEvent(
        new CustomEvent('get-word:magic-account-access-denied')
      )
    },
    { capture: true }
  )
}
