import { useState } from 'react'
import { Link } from 'react-router'
import { useSpaces, type Space } from '../api/spaces'
import { iconButtonClass, Page } from '../components/AppBar'
import { Icon, type IconName } from '../components/Icon'
import { Button, Fab, Hint, LoadError, Loading, SectionTitle } from '../components/ui'
import { t } from '../i18n/messages'
import { getLastList } from '../lists/lastList'
import { useSpaceLists } from '../offline/engine'
import { useOnline } from '../offline/online'
import { NewListDialog, NewSpaceDialog } from './space/SpaceDialogs'

/**
 * Start page: all lists of all spaces - opening a list is one tap. + at the bottom creates a list (as on
 * a list page for items); spaces and settings are icons in the header, their names show as tooltips.
 */
export function HomePage() {
  const { data: spaces, isPending, error, refetch } = useSpaces()
  const [dialog, setDialog] = useState<'list' | 'space' | null>(null)
  // "New list" below a space creates the list there; the + button preselects the last used space.
  const [newListSpaceId, setNewListSpaceId] = useState<string | undefined>()
  const lastList = getLastList()
  const openNewList = (spaceId?: string) => {
    setNewListSpaceId(spaceId ?? (spaces?.some((s) => s.id === lastList?.spaceId) ? lastList?.spaceId : undefined))
    setDialog('list')
  }

  return (
    <Page
      title={t('start.title')}
      actions={
        <>
          <HeaderLink to="/spaces" label={t('spaces.title')} icon="spaces" />
          <HeaderLink to="/settings" label={t('nav.settings')} icon="settings" />
        </>
      }
    >
      {isPending && <Loading />}
      {error && !spaces && <LoadError error={error} onRetry={() => void refetch()} />}
      {spaces?.length === 0 && (
        <div className="space-y-4 py-8 text-center">
          <p className="text-muted">{t('start.noSpaces')}</p>
          <Button onClick={() => setDialog('space')}>{t('start.createSpace')}</Button>
        </div>
      )}
      {spaces?.map((space) => (
        <SpaceLists key={space.id} space={space} showName={spaces.length > 1} lastListId={lastList?.listId} onNewList={() => openNewList(space.id)} />
      ))}
      {/* Without a space there is nowhere to put a list: the page asks to create a space instead. */}
      {!!spaces?.length && <Fab label={t('newList.title')} onClick={() => openNewList()} />}
      {dialog === 'list' && spaces && (
        <NewListDialog
          spaces={spaces}
          defaultSpaceId={newListSpaceId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'space' && <NewSpaceDialog onClose={() => setDialog(null)} />}
    </Page>
  )
}

/** The lists of one space (from the offline store, so this works without connection). */
function SpaceLists(props: { space: Space; showName: boolean; lastListId?: string; onNewList: () => void }) {
  const lists = useSpaceLists(props.space.id)
  const online = useOnline()
  return (
    <section aria-label={props.space.name}>
      {props.showName ? <SectionTitle>{props.space.name}</SectionTitle> : <div className="h-3" />}
      {/* Nothing on this device yet: offline it would load forever, so say why nothing shows. */}
      {lists === undefined && (online ? <Loading /> : <Hint>{t('start.notLoadedOffline')}</Hint>)}
      {lists?.length === 0 && (
        <Hint>
          {t('start.noLists')}{' '}
          <button type="button" onClick={props.onNewList} className="font-semibold text-accent underline">
            {t('newList.title')}
          </button>
        </Hint>
      )}
      {lists?.map((list) => {
        // Only the number of open items, no item names: the start page stays calm and quick to scan.
        const open = list.items.filter((i) => !i.checked)
        return (
          <Link
            key={list.id}
            to={`/spaces/${props.space.id}/lists/${list.id}`}
            className="flex min-h-12 items-center gap-3 border-b border-line px-2 py-2 hover:bg-raised"
          >
            {/* wrap-anywhere: a long name without spaces wraps instead of running under the count */}
            <span className="min-w-0 flex-1 wrap-anywhere">
              <span className="text-lg font-semibold">{list.name}</span>
              {/* only worth saying when there is more than one list to choose from */}
              {list.id === props.lastListId && (lists.length > 1 || props.showName) && <span className="text-sm font-semibold text-accent"> · {t('start.lastUsed')}</span>}
            </span>
            <span
              aria-hidden="true"
              className={`flex h-7 min-w-7 items-center justify-center rounded-full bg-raised px-2 text-sm tabular-nums ${open.length ? 'font-semibold' : 'text-muted'}`}
            >
              {open.length || '✓'}
            </span>
            {/* aria-label on a plain span is ignored by many screen readers: real (hidden) text instead */}
            <span className="sr-only">{t('lists.openCount', { count: open.length })}</span>
          </Link>
        )
      })}
    </section>
  )
}

/** An icon-only link in the header; `title` shows the name as a tooltip on hover. */
function HeaderLink({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <Link to={to} aria-label={label} title={label} className={iconButtonClass}>
      <Icon name={icon} className="text-[1.3rem]" />
    </Link>
  )
}
