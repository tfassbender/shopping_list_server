import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from './App'
import { setLanguage } from './i18n/messages'
import { fakeSyncServer } from './test/fakeSyncServer'
import { mockApi, testUser } from './test/mockApi'
import { loginForTest, renderWithProviders } from './test/render'

const space = { id: 's1', name: 'Home', myRole: 'MEMBER', memberCount: 1, createdAt: '' }
const list = {
  id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1,
  items: [{ id: '1', name: 'Milk', quantity: null, unit: null, note: null, categoryId: null, checked: false, createdAt: '2026-01-01T00:00:00Z', seq: 1 }],
}

function listRoutes(user = testUser) {
  return {
    'GET /api/users/me': user,
    'GET /api/spaces/s1': space,
    'GET /api/spaces/s1/catalog': { categories: [], units: [] },
    'GET /api/spaces/s1/layouts': [],
    ...fakeSyncServer('s1', [list]).routes,
  }
}

describe('language', () => {
  beforeEach(() => loginForTest())
  afterEach(() => setLanguage('en'))

  it('follows the language in the user settings', async () => {
    mockApi(listRoutes({ ...testUser, settings: { ...testUser.settings, language: 'de' } }))
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    expect(await screen.findByLabelText('Artikel hinzufügen...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Milk bearbeiten' })).toBeInTheDocument()
  })

  it('can be switched before login', async () => {
    localStorage.clear()
    const { reloadSessionForTests } = await import('./auth/session')
    reloadSessionForTests()
    mockApi({})
    renderWithProviders(<AppRoutes />, '/login')

    await userEvent.click(screen.getByRole('button', { name: 'de' }))
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument()
  })
})

describe('voice input', () => {
  beforeEach(() => loginForTest())
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })

  it('is hidden without browser support', async () => {
    mockApi(listRoutes())
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')
    await screen.findByLabelText('Add item...')
    expect(screen.queryByRole('button', { name: 'Speak an item' })).not.toBeInTheDocument()
  })

  it('puts the recognized text into the field', async () => {
    class FakeRecognition {
      lang = ''
      interimResults = true
      maxAlternatives = 5
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: ' Oat milk ' }]] })
          this.onend?.()
        }, 0)
      }
      abort() {}
    }
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    mockApi(listRoutes())
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.click(await screen.findByRole('button', { name: 'Speak an item' }))

    await waitFor(() => expect(screen.getByLabelText('Add item...')).toHaveValue('Oat milk'))
  })
})

describe('dialogs', () => {
  beforeEach(() => loginForTest())

  it('close with Escape', async () => {
    mockApi(listRoutes())
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('Milk')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
