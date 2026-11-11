import { vi } from 'vitest'
import { applyTheme, isDark } from './theme'

describe('isDark', () => {
  it('follows the system setting for "system"', () => {
    expect(isDark('system', true)).toBe(true)
    expect(isDark('system', false)).toBe(false)
  })

  it('ignores the system setting for explicit preferences', () => {
    expect(isDark('dark', false)).toBe(true)
    expect(isDark('light', true)).toBe(false)
  })
})

describe('applyTheme', () => {
  /** A controllable `(prefers-color-scheme: dark)` media query. */
  function fakeSystemTheme(prefersDark: boolean) {
    const listeners = new Set<() => void>()
    const media = {
      matches: prefersDark,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList)
    return {
      listeners,
      change(dark: boolean) {
        media.matches = dark
        listeners.forEach((listener) => listener())
      },
    }
  }

  afterEach(() => document.documentElement.classList.remove('dark'))

  it('forces dark and light regardless of the system', () => {
    const system = fakeSystemTheme(false)

    applyTheme('dark')
    expect(document.documentElement).toHaveClass('dark')
    applyTheme('light')
    expect(document.documentElement).not.toHaveClass('dark')
    // explicit choices do not listen for system changes
    expect(system.listeners.size).toBe(0)
  })

  it('follows live system changes for "system" until cleaned up', () => {
    const system = fakeSystemTheme(true)

    const stop = applyTheme('system')
    expect(document.documentElement).toHaveClass('dark')
    system.change(false)
    expect(document.documentElement).not.toHaveClass('dark')

    stop()
    expect(system.listeners.size).toBe(0)
    system.change(true)
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
