'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearStoredAuthBootDebugLogs,
  enableAuthBootDebug,
  getAuthBootDebugSnapshot,
  getStoredAuthBootDebugLogs,
  isAuthBootDebugEnabled,
  logAuthBootDebug,
  type AuthBootDebugEntry,
} from '@/features/auth/client/auth-boot-debug'
import { useAuth } from '@/features/auth/client/useAuth'

function formatLogs(entries: AuthBootDebugEntry[]) {
  return JSON.stringify(entries, null, 2)
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function AuthDebugPage() {
  const auth = useAuth()
  const [logs, setLogs] = useState<AuthBootDebugEntry[]>(() =>
    getStoredAuthBootDebugLogs()
  )
  const [copyStatus, setCopyStatus] = useState<string>('Ready')
  const [debugEnabled, setDebugEnabled] = useState(() => isAuthBootDebugEnabled())

  const refreshLogs = useCallback(() => {
    setLogs(getStoredAuthBootDebugLogs())
    setDebugEnabled(isAuthBootDebugEnabled())
  }, [])

  useEffect(() => {
    enableAuthBootDebug()
    logAuthBootDebug('auth-debug-page-mounted')

    const initialRefreshId = window.setTimeout(refreshLogs, 0)
    const intervalId = window.setInterval(refreshLogs, 1000)
    return () => {
      window.clearTimeout(initialRefreshId)
      window.clearInterval(intervalId)
    }
  }, [refreshLogs])

  const json = useMemo(() => formatLogs(logs), [logs])
  const latestSnapshot = logs.at(-1)?.snapshot
  const displayedSnapshot = useMemo(() => {
    if (latestSnapshot) {
      return latestSnapshot
    }

    if (typeof window === 'undefined') {
      return null
    }

    return getAuthBootDebugSnapshot()
  }, [latestSnapshot])

  const handleSnapshot = useCallback(() => {
    logAuthBootDebug('auth-debug-manual-snapshot', {
      manual: true,
      currentAuthStatus: auth.status,
      isConnected: auth.isConnected,
    })
    refreshLogs()
  }, [auth.isConnected, auth.status, refreshLogs])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopyStatus('Copied')
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'Copy failed')
    }
  }, [json])

  const handleDownload = useCallback(() => {
    downloadText(`get-word-auth-debug-${Date.now()}.json`, json)
  }, [json])

  const handleClear = useCallback(() => {
    clearStoredAuthBootDebugLogs()
    logAuthBootDebug('auth-debug-logs-cleared')
    refreshLogs()
    setCopyStatus('Cleared')
  }, [refreshLogs])

  const handleEnable = useCallback(() => {
    enableAuthBootDebug()
    logAuthBootDebug('auth-debug-enabled-from-page')
    refreshLogs()
  }, [refreshLogs])

  return (
    <main className="min-h-screen bg-[#f5f2e9] px-4 py-6 text-[#161b22] sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="flex flex-col gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#6f6253]">
              Get Word
            </p>
            <h1 className="text-2xl font-semibold">Auth Debug</h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded border border-black/10 bg-white px-2 py-1">
              Debug {debugEnabled ? 'on' : 'off'}
            </span>
            <span className="rounded border border-black/10 bg-white px-2 py-1">
              Events {logs.length}
            </span>
            <span className="rounded border border-black/10 bg-white px-2 py-1">
              Auth {auth.status}
            </span>
            <span className="rounded border border-black/10 bg-white px-2 py-1">
              Connected {auth.isConnected ? 'yes' : 'no'}
            </span>
          </div>
        </header>

        <section className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleEnable}
            className="rounded bg-[#111827] px-3 py-3 text-sm font-semibold text-white"
          >
            Enable
          </button>
          <button
            type="button"
            onClick={handleSnapshot}
            className="rounded border border-black/15 bg-white px-3 py-3 text-sm font-semibold"
          >
            Snapshot
          </button>
          <button
            type="button"
            onClick={auth.signIn}
            className="rounded border border-black/15 bg-white px-3 py-3 text-sm font-semibold"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded border border-black/15 bg-white px-3 py-3 text-sm font-semibold"
          >
            Copy JSON
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded border border-black/15 bg-white px-3 py-3 text-sm font-semibold"
          >
            Download
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded border border-red-300 bg-white px-3 py-3 text-sm font-semibold text-red-700"
          >
            Clear
          </button>
        </section>

        <section className="grid gap-3 border border-black/10 bg-white p-3">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">Latest Snapshot</span>
            <span className="text-[#6f6253]">{copyStatus}</span>
          </div>
          <pre className="max-h-72 overflow-auto rounded bg-[#111827] p-3 text-xs leading-relaxed text-white">
            {JSON.stringify(displayedSnapshot, null, 2)}
          </pre>
        </section>

        <section className="grid gap-2">
          <label className="text-sm font-semibold" htmlFor="auth-debug-json">
            Stored Logs
          </label>
          <textarea
            id="auth-debug-json"
            readOnly
            value={json}
            className="min-h-[45vh] w-full resize-y rounded border border-black/10 bg-white p-3 font-mono text-xs leading-relaxed"
          />
        </section>
      </div>
    </main>
  )
}
