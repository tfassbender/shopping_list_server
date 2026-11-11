import { clearSession, getSession, isExpired, reloadSessionForTests, setSession, shouldRefresh } from './session'

describe('session store', () => {
  it('persists the session in localStorage', () => {
    setSession('abc', '2030-01-01T00:00:00Z')
    reloadSessionForTests()
    expect(getSession()?.token).toBe('abc')

    clearSession()
    reloadSessionForTests()
    expect(getSession()).toBeNull()
  })

  it('refreshes tokens older than a day that are not expired', () => {
    const received = new Date('2026-01-01T00:00:00Z')
    setSession('abc', '2026-01-31T00:00:00Z', received)
    const session = getSession()!

    expect(shouldRefresh(session, new Date('2026-01-01T12:00:00Z'))).toBe(false)
    expect(shouldRefresh(session, new Date('2026-01-02T00:00:01Z'))).toBe(true)
    expect(shouldRefresh(session, new Date('2026-02-01T00:00:00Z'))).toBe(false)
    expect(isExpired(session, new Date('2026-02-01T00:00:00Z'))).toBe(true)
  })
})
