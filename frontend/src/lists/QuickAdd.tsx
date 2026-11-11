import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSuggestions, type Category, type Suggestion } from '../api/catalog'
import { Button } from '../components/ui'
import { t } from '../i18n/messages'

export interface NewItem {
  name: string
  categoryId?: string | null
  unit?: string | null
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
 * Input for fast entry with autocomplete from the space's item history. Picking a suggestion adds the
 * item right away with its last category and unit. Arrow keys + Enter work too (combobox pattern).
 */
export function QuickAdd({ spaceId, categories, onAdd }: { spaceId: string; categories: Category[]; onAdd: (item: NewItem) => void }) {
  const [name, setName] = useState('')
  const [highlighted, setHighlighted] = useState(-1)
  const query = useDebounced(name, 150)
  const { data } = useSuggestions(spaceId, query)
  const suggestions = name.trim() ? (data ?? []) : []

  function add(item: NewItem) {
    onAdd(item)
    setName('') // keep focus in the field for fast entry of the next item
    setHighlighted(-1)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const chosen = suggestions[highlighted]
    if (chosen) add(fromSuggestion(chosen))
    else if (name.trim()) add({ name: name.trim() })
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((h) => Math.max(h - 1, -1))
    } else if (event.key === 'Escape') {
      setHighlighted(-1)
    }
  }

  const categoryOf = (s: Suggestion) => categories.find((c) => c.id === s.categoryId)

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex gap-2">
        <input
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="quick-add-suggestions"
          aria-label={t('list.addPlaceholder')}
          placeholder={t('list.addPlaceholder')}
          autoComplete="off"
          value={name}
          maxLength={100}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setName(e.target.value)
            setHighlighted(-1)
          }}
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-green-600 focus:ring-2 focus:ring-green-600/30 focus:outline-none dark:border-gray-600 dark:bg-gray-900"
        />
        <Button type="submit" aria-label={t('list.add')} disabled={!name.trim()} className="min-h-12 text-xl">
          +
        </Button>
      </div>
      {suggestions.length > 0 && (
        <ul id="quick-add-suggestions" role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.name} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onClick={() => add(fromSuggestion(suggestion))}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${index === highlighted ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
              >
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: categoryOf(suggestion)?.color ?? 'transparent' }} />
                <span className="flex-1">{suggestion.name}</span>
                {categoryOf(suggestion) && <span className="text-xs text-gray-500 dark:text-gray-400">{categoryOf(suggestion)!.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

function fromSuggestion(s: Suggestion): NewItem {
  return { name: s.name, categoryId: s.categoryId, unit: s.unit }
}
