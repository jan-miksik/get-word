import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom intentionally leaves these browser APIs unimplemented and logs a
// noisy error whenever application code probes them. Keep the same fallback
// semantics the tests already relied on while making successful runs readable.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => null),
})

Object.defineProperties(HTMLMediaElement.prototype, {
  load: { configurable: true, value: vi.fn() },
  pause: { configurable: true, value: vi.fn() },
  play: { configurable: true, value: vi.fn(() => Promise.resolve()) },
})

afterEach(cleanup)
