import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { reloadSessionForTests } from '../auth/session'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  reloadSessionForTests()
})

// jsdom has no matchMedia; the theme code needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
})
