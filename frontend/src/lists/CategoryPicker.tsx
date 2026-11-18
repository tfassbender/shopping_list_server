import { useId, useState, type KeyboardEvent } from 'react'
import type { Category } from '../api/catalog'
import { Icon } from '../components/Icon'
import { t } from '../i18n/messages'

/**
 * Category field of the item dialogs. A native <select> can't be searched (on phones it opens the system
 * picker), and a space can have many categories - so this is a button that opens a list right below it,
 * with a search field on top. The first entry is "no category" (or "automatic"), labelled by `noneLabel`.
 * `inactiveIds` (categories the chosen shop doesn't have) come last and greyed out, but can be chosen.
 *
 * Keyboard: typing filters, Enter takes the first match, Escape closes only the list (not the dialog).
 */
export function CategoryPicker(props: {
  label: string
  value: string
  onChange: (categoryId: string) => void
  categories: Category[]
  noneLabel: string
  inactiveIds?: ReadonlySet<string>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = props.categories.find((c) => c.id === props.value)

  const q = query.trim().toLowerCase()
  const inactive = (id: string) => props.inactiveIds?.has(id) ?? false
  const filtered = props.categories.filter((c) => c.name.toLowerCase().includes(q))
  const matches = [...filtered.filter((c) => !inactive(c.id)), ...filtered.filter((c) => inactive(c.id))]
  // "none" only while not searching: a search is for finding a category
  const options: { id: string; name: string; color?: string }[] = q ? matches : [{ id: '', name: props.noneLabel }, ...matches]

  function choose(categoryId: string) {
    props.onChange(categoryId)
    setOpen(false)
    setQuery('')
  }

  function onSearchKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault() // the dialog is a form: Enter must not save it
      if (options[0]) choose(options[0].id)
    } else if (event.key === 'Escape') {
      event.stopPropagation() // the dialog closes on Escape - only the list should
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {props.label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 text-left text-base text-fg focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
      >
        <ColorDot color={selected?.color} />
        <span className="min-w-0 flex-1 truncate">{selected?.name ?? props.noneLabel}</span>
        <Icon name="dropdown" className={`text-xs text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-line bg-surface shadow-lg">
          <input
            type="search"
            aria-label={t('category.search')}
            placeholder={t('category.search')}
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="block min-h-11 w-full rounded-t-lg border-b border-line bg-raised px-3 text-base text-fg focus:outline-none"
          />
          {/* ~5 rows visible, the rest scrolls - the dialog stays usable on small phones */}
          <ul role="listbox" aria-label={props.label} className="max-h-[13.5rem] overflow-y-auto">
            {options.map((option) => (
              <li key={option.id || '__none'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === props.value}
                  onClick={() => choose(option.id)}
                  className={`flex min-h-[2.6rem] w-full items-center gap-2 border-b border-line px-3 text-left last:border-b-0 hover:bg-raised ${option.id === props.value ? 'font-semibold' : ''} ${option.id && inactive(option.id) ? 'opacity-45' : ''}`}
                >
                  <ColorDot color={option.color} />
                  <span className="flex-1">{option.name}</span>
                  {option.id === props.value && <Icon name="check" className="text-accent" />}
                </button>
              </li>
            ))}
            {options.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('category.noMatch')}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The category color; an empty ring for "no category". */
function ColorDot({ color }: { color?: string }) {
  return <span aria-hidden="true" className={`size-3 shrink-0 rounded-full ${color ? '' : 'border border-line'}`} style={{ backgroundColor: color }} />
}
