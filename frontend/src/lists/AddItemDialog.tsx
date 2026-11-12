import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSuggestions, type Catalog, type Suggestion } from '../api/catalog'
import { Dialog, DialogActions } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { Button, SelectField } from '../components/ui'
import { t } from '../i18n/messages'
import { AmountUnitFields } from './AmountUnitFields'
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
 * The dialog behind the + button. "Add another" (or Enter) adds the item and keeps the dialog open, empty
 * and focused, for the next one; "Done" adds the item (if one is entered) and closes; "Cancel" or Escape
 * closes without adding. Suggestions from the item history appear below the name - tapping one adds it at
 * once with its last category and unit. The category "Automatic" lets the server fill it in from the history.
 */
export function AddItemDialog({ spaceId, catalog, onAdd, onClose }: { spaceId: string; catalog?: Catalog; onAdd: (item: NewItem) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [highlighted, setHighlighted] = useState(-1)
  const [listening, setListening] = useState(false)
  const [voiceFailed, setVoiceFailed] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const query = useDebounced(name, 150)
  const { data } = useSuggestions(spaceId, query)
  // The dropdown shows while the name field (or the dropdown itself) has the focus.
  const [nameFocused, setNameFocused] = useState(true)
  // Escape closes only the dropdown (until the next keystroke), not the whole dialog.
  const [dismissed, setDismissed] = useState(false)
  const suggestions = name.trim() && nameFocused && !dismissed ? (data ?? []) : []
  const listbox = useRef<HTMLUListElement>(null)

  // Arrow keys move the highlight; keep it visible in the (scrolling) dropdown, or Enter would add an
  // item the user can't see.
  useEffect(() => {
    if (highlighted >= 0) listbox.current?.children[highlighted]?.scrollIntoView?.({ block: 'nearest' })
  }, [highlighted])

  function add(item: NewItem) {
    onAdd(item)
    setName('')
    setQuantity('')
    setUnit('')
    setCategoryId('')
    setHighlighted(-1)
    nameInput.current?.focus()
  }

  /** Adds what is entered (or the highlighted suggestion); nothing if the name is empty. */
  function addCurrent() {
    const chosen = suggestions[highlighted]
    if (chosen) addSuggestion(chosen)
    else if (name.trim()) add({ name: name.trim(), quantity: quantity.trim() || null, unit: unit.trim() || null, categoryId: categoryId || null })
  }

  /** A suggestion brings its last category and unit; an amount or unit typed before is kept. */
  function addSuggestion(suggestion: Suggestion) {
    add({ name: suggestion.name, categoryId: suggestion.categoryId, quantity: quantity.trim() || null, unit: unit.trim() || suggestion.unit })
  }

  function done() {
    addCurrent()
    onClose()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((h) => Math.max(h - 1, -1))
    } else if (event.key === 'Escape' && suggestions.length > 0) {
      event.stopPropagation() // the dialog closes on Escape - only the dropdown should
      setDismissed(true)
      setHighlighted(-1)
    }
  }

  function startVoiceInput() {
    setVoiceFailed(false)
    setListening(true)
    // The recognized text goes into the field; the user confirms with "Add" (speech is sometimes wrong).
    listenOnce({ onText: setName, onError: () => setVoiceFailed(true), onEnd: () => setListening(false) })
  }

  return (
    <Dialog title={t('addItem.title')} onClose={onClose} onSubmit={addCurrent}>
      <AmountUnitFields quantity={quantity} unit={unit} units={catalog?.units ?? []} onQuantityChange={setQuantity} onUnitChange={setUnit} />
      {/*
        * The suggestions are a dropdown laid over the fields below (absolute position), so the dialog keeps
        * its height; it scrolls when there are more than fit. Its height ends above the dialog buttons, so a
        * tap on "Done" never hits a suggestion by accident.
        */}
      <div
        className="relative flex items-end gap-2"
        onFocus={() => setNameFocused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setNameFocused(false)}
      >
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
            value={name}
            onKeyDown={onKeyDown}
            onChange={(e) => {
              setName(e.target.value)
              setHighlighted(-1)
              setDismissed(false)
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
            <Icon name="microphone" className="text-xl" />
          </button>
        )}
        {suggestions.length > 0 && (
          <ul id="add-item-suggestions" ref={listbox} role="listbox" aria-label={t('addItem.suggestions')} className="absolute inset-x-0 top-full z-10 mt-1 max-h-[6.25rem] overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
            {suggestions.map((suggestion, index) => {
              const category = catalog?.categories.find((c) => c.id === suggestion.categoryId)
              return (
                <li key={suggestion.name} role="option" aria-selected={index === highlighted}>
                  <button
                    type="button"
                    // keeps the focus in the name field (otherwise the dropdown would close before the click)
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => addSuggestion(suggestion)}
                    className={`flex min-h-[2.6rem] w-full items-center gap-2 border-b border-line px-3 text-left last:border-b-0 hover:bg-raised ${index === highlighted ? 'bg-raised' : ''}`}
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
      </div>
      {voiceFailed && <p className="text-sm text-danger">{t('voice.error')}</p>}
      <SelectField label={t('item.category')} value={categoryId} onChange={setCategoryId}>
        <option value="">{t('item.categoryAuto')}</option>
        {catalog?.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <DialogActions>
        <Button variant="ghost" className="mr-auto" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="secondary" disabled={!name.trim() && highlighted < 0}>
          {t('addItem.another')}
        </Button>
        <Button onClick={done}>{t('common.done')}</Button>
      </DialogActions>
    </Dialog>
  )
}
