import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import { mockApi, testUser } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'
import { isKeepScreenOnSupported, KeepScreenOn, keepScreenOnEnabled, setKeepScreenOn } from './keepScreenOn'

/** A fake Screen Wake Lock API (jsdom has none): counts requests and releases. */
function fakeWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn> }[] = []
  const request = vi.fn(async () => {
    const sentinel = { release: vi.fn(async () => {}) }
    sentinels.push(sentinel)
    return sentinel
  })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  return { request, sentinels }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('keep the screen on', () => {
  beforeEach(() => localStorage.removeItem('shoppinglist.keepScreenOn'))
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).wakeLock
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('is on by default and holds a screen wake lock', async () => {
    const { request } = fakeWakeLock()
    expect(keepScreenOnEnabled()).toBe(true)

    render(<KeepScreenOn />)
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
  })

  it('requests the lock again when the app becomes visible (the browser drops it when hidden)', async () => {
    const { request } = fakeWakeLock()
    render(<KeepScreenOn />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    act(() => setVisibility('hidden'))
    expect(request).toHaveBeenCalledTimes(1) // no request while hidden
    act(() => setVisibility('visible'))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('releases the lock when switched off and takes it again when switched on', async () => {
    const { request, sentinels } = fakeWakeLock()
    render(<KeepScreenOn />)
    await waitFor(() => expect(sentinels).toHaveLength(1))

    act(() => setKeepScreenOn(false))
    expect(keepScreenOnEnabled()).toBe(false)
    await waitFor(() => expect(sentinels[0].release).toHaveBeenCalled())
    act(() => setVisibility('visible'))
    expect(request).toHaveBeenCalledTimes(1)

    act(() => setKeepScreenOn(true))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('does nothing in browsers without the API', () => {
    expect(isKeepScreenOnSupported()).toBe(false)
    expect(() => render(<KeepScreenOn />)).not.toThrow()
  })

  describe('in the settings', () => {
    beforeEach(() => {
      loginForTest()
      mockApi({ 'GET /api/users/me': testUser })
    })

    it('can be switched off and on', async () => {
      fakeWakeLock()
      renderWithProviders(<AppRoutes />, '/settings')

      const toggle = await screen.findByRole('switch', { name: 'Keep the screen on' })
      expect(toggle).toBeChecked()
      await userEvent.click(toggle)
      expect(toggle).not.toBeChecked()
      expect(localStorage.getItem('shoppinglist.keepScreenOn')).toBe('false')
    })

    it('is not offered without browser support', async () => {
      renderWithProviders(<AppRoutes />, '/settings')
      await screen.findByRole('switch', { name: 'Show notes about merged changes' })
      expect(screen.queryByRole('switch', { name: 'Keep the screen on' })).not.toBeInTheDocument()
    })
  })
})
