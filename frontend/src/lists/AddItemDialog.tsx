import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSuggestions, type Catalog, type Suggestion } from '../api/catalog'
import { Dialog, DialogActions } from '../components/Dialog'
import { Button, SelectField, TextField } from '../components/ui'
import { t } from '../i18n/messages'
import { parseAmount } from './amount'
import { isVoiceInputSupported, listenOnce } from './voiceInput'

export interface NewItem {
  name: string
  quantity?: string | null
  unit?: string | null
  categoryId?: string | null
}

/** Waits until the user stops typing for `ms` before using the value (fewer server requests). */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/**
 * The dialog behind the + button. It stays open after "Add", empty and focused, so several items can be
 * entered in a row; "Done" or Escape closes it. Suggestions from the item history appear below the name -
 * tapping one adds it at once with its last category and unit. The category "Automatic" lets the server
 * fill it in from the history.
 */
export function AddItemDialog({ spaceId, catalog, onAdd, onClose }: { spaceId: string; catalog?: Catalog; onAdd: (item: NewItem) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [highlighted, setHighlighted] = useState(-1)
  const [listening, setListening] = useState(false)
  const [voiceFailed, setVoiceFailed] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const query = useDebounced(name, 150)
  const { data } = useSuggestions(spaceId, query)
  const suggestions = name.trim() ? (data ?? []).slice(0, 5) : []

  function add(item: NewItem) {
    onAdd(item)
    setAdded(item.name)
    setName('')
    setAmount('')
    setCategoryId('')
    setHighlighted(-1)
    nameInput.current?.focus()
  }

  function submit() {
    const chosen = suggestions[highlighted]
    if (chosen) add(fromSuggestion(chosen))
    else if (name.trim()) add({ name: name.trim(), ...parseAmount(amount), categoryId: categoryId || null })
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((h) => Math.max(h - 1, -1))
    }
  }

  function startVoiceInput() {
    setVoiceFailed(false)
    setListening(true)
    // The recognized text goes into the field; the user confirms with "Add" (speech is sometimes wrong).
    listenOnce({ onText: setName, onError: () => setVoiceFailed(true), onEnd: () => setListening(false) })
  }

  return (
    <Dialog title={t('addItem.title')} onClose={onClose} onSubmit={submit}>
      <div className="flex items-end gap-2">
        <div className="block min-w-0 flex-1">
          <label htmlFor="add-item-name" className="mb-1 block text-sm text-muted">
            {t('item.name')}
          </label>
          <input
            id="add-item-name"
            ref={nameInput}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="add-item-suggestions"
            autoFocus
            autoComplete="off"
            maxLength={100}
            placeholder={t('addItem.namePlaceholder')}
            value={name}
            onKeyDown={onKeyDown}
            onChange={(e) => {
              setName(e.target.value)
              setHighlighted(-1)
              setAdded(null)
            }}
            className="block min-h-12 w-full rounded-lg border border-line bg-raised px-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          />
        </div>
        {isVoiceInputSupported() && (
          <button
            type="button"
            aria-label={listening ? t('voice.listening') : t('voice.start')}
            aria-pressed={listening}
            onClick={startVoiceInput}
            disabled={listening}
            className={`flex size-12 shrink-0 items-center justify-center rounded-lg border border-line text-muted ${listening ? 'animate-pulse' : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
      </div>
      {voiceFailed && <p className="text-sm text-danger">{t('voice.error')}</p>}
      {suggestions.length > 0 && (
        <ul id="add-item-suggestions" role="listbox" aria-label={t('addItem.suggestions')} className="overflow-hidden rounded-lg border border-line">
          {suggestions.map((suggestion, index) => {
            const category = catalog?.categories.find((c) => c.id === suggestion.categoryId)
            return (
              <li key={suggestion.name} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onClick={() => add(fromSuggestion(suggestion))}
                  className={`flex min-h-12 w-full items-center gap-2 border-b border-line px-3 text-left last:border-b-0 hover:bg-raised ${index === highlighted ? 'bg-raised' : ''}`}
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? 'transparent' }} />
                  <span className="flex-1">{suggestion.name}</span>
                  {category && <span className="text-sm text-muted">{category.name}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <TextField className="min-w-36 flex-1" label={t('item.amount')} placeholder={t('item.amountPlaceholder')} maxLength={41} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField className="min-w-36 flex-1" label={t('item.category')} value={categoryId} onChange={setCategoryId}>
          <option value="">{t('item.categoryAuto')}</option>
          {catalog?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>
      {added && (
        <p role="status" className="text-sm text-accent">
          {t('addItem.added', { name: added })}
        </p>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.done')}
        </Button>
        <Button type="submit" disabled={!name.trim() && highlighted < 0}>
          {t('addItem.add')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function fromSuggestion(s: Suggestion): NewItem {
  return { name: s.name, categoryId: s.categoryId, unit: s.unit }
}
