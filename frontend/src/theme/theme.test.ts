import { isDark } from './theme'

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
