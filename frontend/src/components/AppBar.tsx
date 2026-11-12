import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useSession } from '../auth/useAuth'
import { getLanguage, setLanguage, t } from '../i18n/messages'
import { SyncIndicator } from '../offline/SyncIndicator'
import { Icon, type IconName } from './Icon'

/** An entry of the ⋮ menu; `'divider'` draws a line between groups. */
export type MenuEntry = { label: string; icon?: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean } | 'divider'

/**
 * The light blue bar at the top of every page: optional back arrow, title (with an optional line below,
 * e.g. the shop), page actions and the ⋮ menu for everything that is rarely needed. It sticks to the top
 * while scrolling.
 */
export function AppBar(props: { title: string; back?: string; sub?: ReactNode; actions?: ReactNode; menu?: MenuEntry[] }) {
  const session = useSession()
  const onStartPage = useLocation().pathname === '/'
  return (
    <header className="sticky top-0 z-20 bg-brand pt-[env(safe-area-inset-top)] text-brand-ink">
      <div className="relative mx-auto max-w-2xl">
        <div className={`flex items-center gap-1 pr-1 ${props.sub ? 'min-h-14' : 'min-h-16'} ${props.back ? 'pl-1' : 'pl-4'}`}>
          {props.back && (
            <Link to={props.back} aria-label={t('common.back')} className={iconButtonClass}>
              <Icon name="back" className="text-[1.3rem]" />
            </Link>
          )}
          {/*
           * On every page but the start page, a tap on the title row (including the empty space after the
           * title) leads to the start page.
           */}
          {session && !onStartPage ? (
            <Link to="/" title={t('nav.toStart')} className="flex min-w-0 flex-1 items-center self-stretch">
              <h1 className="truncate text-[1.35rem] font-bold">{props.title}</h1>
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center self-stretch">
              <h1 className="truncate text-[1.35rem] font-bold">{props.title}</h1>
            </div>
          )}
          {session ? <SyncIndicator /> : <LanguageToggle />}
          {props.actions}
          {props.menu && <Menu entries={props.menu} />}
        </div>
        {/*
         * The line below the title (e.g. the shop) gets a row of its own, so the badges and buttons next
         * to the title don't squeeze it. Indented to line up with the title.
         */}
        {props.sub && <div className={`-mt-1 pr-4 pb-2 ${props.back ? 'pl-[3.25rem]' : 'pl-4'}`}>{props.sub}</div>}
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
        <Icon name="menu" className="text-[1.3rem]" />
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
                  className={`flex w-full items-center gap-4 px-5 py-3 text-left text-lg hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent ${entry.danger ? 'text-danger' : ''}`}
                >
                  {/* fixed-width slot, so the texts line up even if an entry has no icon */}
                  <span className="flex w-5 shrink-0 justify-center">{entry.icon && <Icon name={entry.icon} className={entry.danger ? '' : 'text-muted'} />}</span>
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

/**
 * Where the back arrow of a page leads: the page it was opened from, if that page passed itself as
 * `navigate(to, { state: { back } })` (e.g. a list opening the categories), otherwise [fallback].
 */
export function useBackTo(fallback: string): string {
  return (useLocation().state as { back?: string } | null)?.back ?? fallback
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
