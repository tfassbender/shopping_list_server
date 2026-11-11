import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useSession } from '../auth/useAuth'
import { getLanguage, setLanguage, t } from '../i18n/messages'
import { SyncIndicator } from '../offline/SyncIndicator'

/** An entry of the ⋮ menu; `'divider'` draws a line between groups. */
export type MenuEntry = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean } | 'divider'

/**
 * The light blue bar at the top of every page: optional back arrow, title (with an optional line below,
 * e.g. the shop), page actions and the ⋮ menu for everything that is rarely needed. It sticks to the top
 * while scrolling.
 */
export function AppBar(props: { title: string; back?: string; sub?: ReactNode; actions?: ReactNode; menu?: MenuEntry[] }) {
  const session = useSession()
  return (
    <header className="sticky top-0 z-20 bg-brand pt-[env(safe-area-inset-top)] text-brand-ink">
      <div className={`relative mx-auto flex min-h-16 max-w-2xl items-center gap-1 pr-1 ${props.back ? 'pl-1' : 'pl-4'}`}>
        {props.back && (
          <Link to={props.back} aria-label={t('common.back')} className={iconButtonClass}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.35rem] font-bold">{props.title}</h1>
          {props.sub}
        </div>
        {session ? <SyncIndicator /> : <LanguageToggle />}
        {props.actions}
        {props.menu && <Menu entries={props.menu} />}
      </div>
    </header>
  )
}

export const iconButtonClass =
  'flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-brand-ink/10 disabled:opacity-40 disabled:hover:bg-transparent'

/** The ⋮ button with its dropdown. A transparent layer behind the dropdown closes it on outside clicks. */
function Menu({ entries }: { entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" aria-label={t('nav.menu')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={iconButtonClass}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          {/* Inside the header, so it lies below the dropdown but above the page. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute top-14 right-1 z-20 min-w-64 rounded-xl border border-line bg-surface py-1.5 text-fg shadow-xl">
            {entries.map((entry, index) =>
              entry === 'divider' ? (
                <hr key={index} className="my-1.5 border-line" />
              ) : (
                <button
                  key={entry.label}
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  onClick={() => {
                    setOpen(false)
                    entry.onSelect()
                  }}
                  className={`block w-full px-5 py-3 text-left text-lg hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent ${entry.danger ? 'text-danger' : ''}`}
                >
                  {entry.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
    </>
  )
}

/** Before login the language can be switched here; afterwards it is a user setting. */
function LanguageToggle() {
  const other = getLanguage() === 'de' ? 'en' : 'de'
  return (
    <button type="button" onClick={() => setLanguage(other)} className="min-h-11 rounded-lg px-3 text-sm font-semibold uppercase hover:bg-brand-ink/10">
      {other}
    </button>
  )
}

/** A page: header bar plus the content in a centered column (full width on phones). */
export function Page(props: { title: string; back?: string; sub?: ReactNode; actions?: ReactNode; menu?: MenuEntry[]; children: ReactNode }) {
  return (
    <>
      <AppBar title={props.title} back={props.back} sub={props.sub} actions={props.actions} menu={props.menu} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-28">{props.children}</main>
    </>
  )
}
