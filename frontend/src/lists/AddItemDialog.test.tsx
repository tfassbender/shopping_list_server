import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { mockApi } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'
import { AddItemDialog } from './AddItemDialog'

const catalog = {
  categories: [
    { id: 'dairy', name: 'Dairy', color: '#0000ff' },
    { id: 'veg', name: 'Vegetables', color: '#00ff00' },
  ],
  units: ['l', 'kg'],
  history: [],
}
const suggestions = [
  { name: 'Milk', categoryId: 'dairy', unit: 'l', usageCount: 5 },
  { name: 'Millet', categoryId: null, unit: null, usageCount: 1 },
]

function setup() {
  mockApi({ 'GET /api/spaces/s1/catalog/suggestions': (_: unknown, url: URL) => (url.searchParams.get('q') === 'mil' ? suggestions : []) })
  const onAdd = vi.fn()
  const onClose = vi.fn()
  renderWithProviders(<AddItemDialog spaceId="s1" catalog={catalog} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose, name: screen.getByRole('combobox', { name: 'Name' }) }
}

/** A fake of the browser's speech recognition; `instances` gives access to the started ones. */
function installSpeechRecognition() {
  const instances: FakeRecognition[] = []
  class FakeRecognition {
    lang = ''
    interimResults = true
    maxAlternatives = 0
    onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null
    onerror: (() => void) | null = null
    onend: (() => void) | null = null
    start = vi.fn()
    abort = vi.fn()
    constructor() {
      instances.push(this)
    }
  }
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true })
  return instances
}

describe('AddItemDialog', () => {
  beforeEach(() => loginForTest())
  afterEach(() => {
    delete (window as { SpeechRecognition?: unknown }).SpeechRecognition
  })

  it('shows suggestions with their category and picks one with the arrow keys and Enter', async () => {
    const { onAdd, name } = setup()

    await userEvent.type(name, 'mil')
    const listbox = await screen.findByRole('listbox', { name: 'Suggestions' })
    expect(name).toHaveAttribute('aria-expanded', 'true')
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['MilkDairy', 'Millet'])

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(within(listbox).getAllByRole('option').map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    // not past the last one
    await userEvent.keyboard('{ArrowDown}')
    expect(within(listbox).getByRole('option', { selected: true })).toHaveTextContent('Millet')
    await userEvent.keyboard('{ArrowUp}')
    expect(within(listbox).getByRole('option', { selected: true })).toHaveTextContent('Milk')

    await userEvent.keyboard('{Enter}')

    expect(onAdd).toHaveBeenCalledWith({ name: 'Milk', categoryId: 'dairy', quantity: null, unit: 'l' })
    // ready for the next item
    expect(name).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('arrow up past the first suggestion goes back to the typed text', async () => {
    const { onAdd, name } = setup()

    await userEvent.type(name, 'mil')
    const listbox = await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}')
    expect(within(listbox).queryByRole('option', { selected: true })).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')

    expect(onAdd).toHaveBeenCalledWith({ name: 'mil', quantity: null, unit: null, categoryId: null })
  })

  it('keeps an amount and unit typed before picking a suggestion', async () => {
    const { onAdd, name } = setup()

    await userEvent.type(screen.getByLabelText('Amount'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Unit'), 'kg')
    await userEvent.type(name, 'mil')
    await userEvent.click(await screen.findByRole('button', { name: /Milk/ }))

    expect(onAdd).toHaveBeenCalledWith({ name: 'Milk', categoryId: 'dairy', quantity: '2', unit: 'kg' })
  })

  it('adds the entered item with the chosen category; "Done" closes', async () => {
    const { onAdd, onClose, name } = setup()

    expect(within(screen.getByLabelText('Category')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Automatic', 'Dairy', 'Vegetables'])
    await userEvent.type(name, '  Carrots ')
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'veg')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onAdd).toHaveBeenCalledWith({ name: 'Carrots', quantity: null, unit: null, categoryId: 'veg' })
    expect(onClose).toHaveBeenCalled()
  })

  it('"Done" with an empty name just closes', async () => {
    const { onAdd, onClose } = setup()

    expect(screen.getByRole('button', { name: 'Add another' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onAdd).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('with the dropdown open, the first Escape only closes the dropdown and keeps the text', async () => {
    const { onClose, name } = setup()

    await userEvent.type(name, 'mil')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(name).toHaveValue('mil')
    // a second Escape (dropdown closed) closes the dialog
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the highlighted suggestion scrolled into view', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { name } = setup()

    await userEvent.type(name, 'mil')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.contexts.at(-1)).toHaveTextContent('Millet')
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('does not add an item with an invalid amount', async () => {
    const { onAdd, onClose, name } = setup()

    await userEvent.type(screen.getByLabelText('Amount'), '1,2,')
    await userEvent.type(name, 'Bread{Enter}')
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()

    expect(onAdd).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(name).toHaveValue('Bread')
  })

  it('Escape closes without adding', async () => {
    const { onAdd, onClose, name } = setup()

    await userEvent.type(name, 'Bread')
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('has no microphone button without speech recognition', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Speak an item' })).not.toBeInTheDocument()
  })

  it('puts the recognized text into the name field without adding it yet', async () => {
    const recognitions = installSpeechRecognition()
    const { onAdd, name } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Speak an item' }))
    const listening = screen.getByRole('button', { name: 'Listening...' })
    expect(listening).toBeDisabled()
    expect(listening).toHaveAttribute('aria-pressed', 'true')
    expect(recognitions[0].start).toHaveBeenCalled()
    expect(recognitions[0].lang).toBe('en-US')

    act(() => {
      recognitions[0].onresult?.({ results: [[{ transcript: ' Tomatoes ' }]] })
      recognitions[0].onend?.()
    })

    expect(name).toHaveValue('Tomatoes')
    expect(screen.getByRole('button', { name: 'Speak an item' })).toBeEnabled()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('tells the user when voice input failed', async () => {
    const recognitions = installSpeechRecognition()
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Speak an item' }))
    act(() => {
      recognitions[0].onerror?.()
      recognitions[0].onend?.()
    })

    expect(screen.getByText('Voice input did not work. Please type instead.')).toBeInTheDocument()

    // a new attempt hides the old error
    await userEvent.click(screen.getByRole('button', { name: 'Speak an item' }))
    expect(screen.queryByText('Voice input did not work. Please type instead.')).not.toBeInTheDocument()
  })
})
