'use client'

import {
  ChainController,
  ConnectorController,
  OptionsController,
} from '@reown/appkit-controllers'
import type { RemoteFeatures } from '@reown/appkit/react'
import { hasRecentMagicAccountAccessDenied } from '@/features/auth/client/magic-rpc'

const DEBUG_FLAG_KEY = 'get-word-auth-debug'
const DEBUG_BOOT_COUNT_KEY = 'get-word-auth-debug-boot-count'
const DEBUG_LOG_STORAGE_KEY = 'get-word-auth-debug-logs'
const DEBUG_PREFIX = '[AuthBoot]'
const MAX_STORED_LOG_ENTRIES = 200
const REQUIRED_SOCIALS = ['google', 'apple'] as const
const SENSITIVE_STORAGE_VALUE = '[redacted]'

const STORAGE_KEYS_TO_LOG = [
  'get_word_device_id',
  '@appkit-wallet/EMAIL_LOGIN_USED_KEY',
  '@appkit-wallet/EMAIL',
  '@appkit-wallet/LAST_USED_CHAIN_KEY',
  '@appkit-wallet/SESSION_TOKEN_KEY',
  '@appkit-wallet/SOCIAL_USERNAME',
  '@appkit/connected_social',
  '@appkit/eip155:connected_connector_id',
  '@appkit/solana:connected_connector_id',
] as const

type AppKitReadyDebugState = {
  installedAt?: number
  settledAt?: number
  result?: boolean
  error?: string
}

export type AuthBootDebugEntry = {
  event: string
  snapshot: Record<string, unknown>
}

type SanitizedConnector = {
  id: unknown
  type: unknown
  name: unknown
  chain: unknown
  email: unknown
  socials: unknown
  providerPresent: boolean
  childConnectors?: SanitizedConnector[]
}

let pageBootId: string | null = null
let pageBootCount: number | null = null
let appKitReadyDebugState: AppKitReadyDebugState = {}

function getWindowWithDebugGlobals() {
  return window as typeof window & {
    navigator: Navigator & { standalone?: boolean }
    __GET_WORD_AUTH_BOOT_LOGS?: AuthBootDebugEntry[]
    __GET_WORD_DUMP_AUTH_DEBUG?: () => AuthBootDebugEntry[]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isIosLike() {
  if (typeof window === 'undefined') {
    return false
  }

  const platform = navigator.platform
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalonePwa() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    getWindowWithDebugGlobals().navigator.standalone === true
  )
}

function hasDebugFlag() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('authDebug') === '1') {
      window.localStorage.setItem(DEBUG_FLAG_KEY, '1')
      return true
    }

    return window.localStorage.getItem(DEBUG_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function enableAuthBootDebug() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DEBUG_FLAG_KEY, '1')
  } catch {
    // Ignore storage failures; the page can still render a one-off snapshot.
  }
}

export function disableAuthBootDebug() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(DEBUG_FLAG_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function isAuthBootDebugEnabled() {
  return shouldLogAuthBootDebug()
}

export function shouldLogAuthBootDebug() {
  if (typeof window === 'undefined') {
    return false
  }

  return hasDebugFlag() || (isIosLike() && isStandalonePwa())
}

function getPageBootId() {
  if (!pageBootId) {
    pageBootId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  return pageBootId
}

function getAndIncrementBootCount() {
  if (typeof window === 'undefined') {
    return null
  }

  if (pageBootCount !== null) {
    return pageBootCount
  }

  try {
    const nextCount = Number(window.localStorage.getItem(DEBUG_BOOT_COUNT_KEY) ?? '0') + 1
    window.localStorage.setItem(DEBUG_BOOT_COUNT_KEY, String(nextCount))
    pageBootCount = nextCount
    return nextCount
  } catch {
    return null
  }
}

function getNavigationSnapshot() {
  if (typeof performance === 'undefined') {
    return {}
  }

  const navigation = performance.getEntriesByType?.('navigation')?.[0] as
    | PerformanceNavigationTiming
    | undefined

  return {
    performanceNowMs: Math.round(performance.now()),
    navigationType: navigation?.type,
    domInteractiveMs:
      typeof navigation?.domInteractive === 'number'
        ? Math.round(navigation.domInteractive)
        : undefined,
    loadEventEndMs:
      typeof navigation?.loadEventEnd === 'number'
        ? Math.round(navigation.loadEventEnd)
        : undefined,
  }
}

function getStorageValueForLog(key: string, value: string | null) {
  if (value === null) {
    return null
  }

  if (key === '@appkit-wallet/EMAIL_LOGIN_USED_KEY') {
    return value
  }

  if (
    key.includes('SESSION_TOKEN') ||
    key.includes('EMAIL') ||
    key.includes('USERNAME') ||
    key === 'get_word_device_id'
  ) {
    return SENSITIVE_STORAGE_VALUE
  }

  return value
}

function getStorageSnapshot() {
  if (typeof window === 'undefined') {
    return {}
  }

  const entries: Record<string, { present: boolean; value: string | null }> = {}

  try {
    STORAGE_KEYS_TO_LOG.forEach((key) => {
      const value = window.localStorage.getItem(key)
      entries[key] = {
        present: value !== null,
        value: getStorageValueForLog(key, value),
      }
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }

  return entries
}

function readStoredAuthBootDebugLogs() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(DEBUG_LOG_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AuthBootDebugEntry[]) : []
  } catch {
    return []
  }
}

function writeStoredAuthBootDebugLogs(entries: AuthBootDebugEntry[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      DEBUG_LOG_STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_STORED_LOG_ENTRIES))
    )
  } catch {
    // Debug persistence is best-effort; console logging still works.
  }
}

function getCookieSnapshot() {
  if (typeof document === 'undefined') {
    return {}
  }

  const cookieNames = new Set(
    document.cookie
      .split(';')
      .map((cookie) => cookie.trim().split('=')[0])
      .filter(Boolean)
  )

  return {
    hasSessionCookie: cookieNames.has('get_word_session'),
    hasUserRoleCookie: cookieNames.has('get_word_user_role'),
    names: Array.from(cookieNames).sort(),
  }
}

function getRequiredAuthFeatures(remoteFeatures: Partial<RemoteFeatures> | undefined) {
  const socials = remoteFeatures?.socials

  return {
    email: remoteFeatures?.email === true,
    socials: Array.isArray(socials) ? socials : socials ?? null,
    hasRequiredSocials:
      Array.isArray(socials) &&
      REQUIRED_SOCIALS.every((social) => socials.includes(social)),
  }
}

function summarizeConnector(connector: unknown): SanitizedConnector | string | null {
  if (connector == null) {
    return null
  }

  if (!isRecord(connector)) {
    return String(connector)
  }

  const childConnectors = connector.connectors

  return {
    id: connector.id,
    type: connector.type,
    name: connector.name,
    chain: connector.chain,
    email: connector.email,
    socials: connector.socials,
    providerPresent: Boolean(connector.provider),
    childConnectors: Array.isArray(childConnectors)
      ? childConnectors
          .map(summarizeConnector)
          .filter((child): child is SanitizedConnector => isRecord(child))
      : undefined,
  }
}

function getControllerSnapshot() {
  const remoteFeatures = OptionsController.state.remoteFeatures
  const authConnector = ConnectorController.getAuthConnector()
  const accountData = ChainController.getAccountData?.(ChainController.state.activeChain)

  return {
    remoteFeatures,
    requiredAuthFeatures: getRequiredAuthFeatures(remoteFeatures),
    authConnectorPresent: Boolean(authConnector),
    authConnector: summarizeConnector(authConnector),
    connectors: ConnectorController.state.connectors.map((connector) =>
      summarizeConnector(connector)
    ),
    allConnectors: ConnectorController.state.allConnectors.map((connector) =>
      summarizeConnector(connector)
    ),
    activeConnector: summarizeConnector(ConnectorController.state.activeConnector),
    activeConnectorIds: ConnectorController.state.activeConnectorIds,
    chain: {
      activeChain: ChainController.state.activeChain,
      activeCaipAddress: ChainController.state.activeCaipAddress,
      activeCaipNetwork: ChainController.state.activeCaipNetwork?.id,
      noAdapters: ChainController.state.noAdapters,
      isSwitchingNamespace: ChainController.state.isSwitchingNamespace,
    },
    account: accountData
      ? {
          status: accountData.status,
          addressPresent: Boolean(accountData.address),
          caipAddressPresent: Boolean(accountData.caipAddress),
          socialProvider: accountData.socialProvider,
          connectedWalletInfo: accountData.connectedWalletInfo,
          user: accountData.user
            ? {
                emailPresent: Boolean(accountData.user.email),
                usernamePresent: Boolean(accountData.user.username),
                accountCount: accountData.user.accounts?.length ?? 0,
              }
            : undefined,
        }
      : undefined,
  }
}

export function markAppKitReadyDebugInstalled() {
  appKitReadyDebugState = {
    installedAt: Date.now(),
  }
}

export function markAppKitReadyDebugSettled(result: boolean, error?: unknown) {
  appKitReadyDebugState = {
    ...appKitReadyDebugState,
    settledAt: Date.now(),
    result,
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
  }
}

export function getAuthBootDebugSnapshot(extra?: Record<string, unknown>) {
  return {
    pageBootId: getPageBootId(),
    bootCount: getAndIncrementBootCount(),
    timestamp: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      isIosLike: isIosLike(),
      isStandalonePwa: isStandalonePwa(),
      visibilityState: document.visibilityState,
      online: navigator.onLine,
      path: window.location.pathname,
      search: window.location.search,
    },
    navigation: getNavigationSnapshot(),
    appKitReady: appKitReadyDebugState,
    controllers: getControllerSnapshot(),
    storage: getStorageSnapshot(),
    cookies: getCookieSnapshot(),
    magic: {
      recentAccountAccessDenied: hasRecentMagicAccountAccessDenied(),
    },
    ...extra,
  }
}

export function logAuthBootDebug(event: string, extra?: Record<string, unknown>) {
  if (!shouldLogAuthBootDebug()) {
    return
  }

  const snapshot = getAuthBootDebugSnapshot(extra)
  const entry = { event, snapshot }
  const windowWithDebugGlobals = getWindowWithDebugGlobals()

  windowWithDebugGlobals.__GET_WORD_AUTH_BOOT_LOGS ??= []
  windowWithDebugGlobals.__GET_WORD_AUTH_BOOT_LOGS.push(entry)
  windowWithDebugGlobals.__GET_WORD_DUMP_AUTH_DEBUG = () =>
    getStoredAuthBootDebugLogs()

  writeStoredAuthBootDebugLogs([...readStoredAuthBootDebugLogs(), entry])

  console.info(`${DEBUG_PREFIX} ${event}`, snapshot)
}

export function getStoredAuthBootDebugLogs() {
  return readStoredAuthBootDebugLogs()
}

export function clearStoredAuthBootDebugLogs() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(DEBUG_LOG_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }

  const windowWithDebugGlobals = getWindowWithDebugGlobals()
  windowWithDebugGlobals.__GET_WORD_AUTH_BOOT_LOGS = []
}
