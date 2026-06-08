type RequestOriginInput = {
  headers: Headers
  nextUrl: {
    origin: string
    protocol: string
  }
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null
}

function normalizeOrigin(raw: string | undefined | null): string | null {
  const value = raw?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function isLocalOrigin(origin: string | null): boolean {
  if (!origin) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function getForwardedOrigin(headers: Headers, fallbackProtocol: string): string | null {
  const forwardedHost = firstHeaderValue(headers.get('x-forwarded-host'))
  const host = forwardedHost || firstHeaderValue(headers.get('host'))
  if (!host) return null

  const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'))
  const protocol = (forwardedProto || fallbackProtocol.replace(/:$/, '') || 'https').toLowerCase()
  if (protocol !== 'http' && protocol !== 'https') return null

  return normalizeOrigin(`${protocol}://${host}`)
}

function getServerConfiguredOrigin(): string | null {
  return (
    normalizeOrigin(process.env.GET_WORD_APP_URL) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_GET_WORD_APP_URL)
  )
}

export function getBrowserPublicOrigin(): string {
  return normalizeOrigin(process.env.NEXT_PUBLIC_GET_WORD_APP_URL) || window.location.origin
}

export function getRequestPublicOrigin(request: RequestOriginInput): string {
  const configured = getServerConfiguredOrigin()
  const forwarded = getForwardedOrigin(request.headers, request.nextUrl.protocol)
  const fallback = normalizeOrigin(request.nextUrl.origin) || request.nextUrl.origin

  if (configured) {
    const productionLocalConfig =
      process.env.NODE_ENV === 'production' &&
      isLocalOrigin(configured) &&
      !isLocalOrigin(forwarded || fallback)

    if (!productionLocalConfig) return configured
  }

  return forwarded || fallback
}
