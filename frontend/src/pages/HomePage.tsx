import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSpaces, type Space } from '../api/spaces'
import { Page } from '../components/AppBar'
import { Button, Hint, LoadError, Loading, SectionTitle } from '../components/ui'
import { t } from '../i18n/messages'
import { getLastList } from '../lists/lastList'
import { useSpaceLists } from '../offline/engine'
import { NewListDialog, NewSpaceDialog } from './space/SpaceDialogs'

/**
 * Start page: all lists of all spaces - opening a list is one tap. Everything rarely needed (new list,
 * spaces, settings) is in the ⋮ menu.
 */
export function HomePage() {
  const { data: spaces, isPending, error, refetch } = useSpaces()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'list' | 'space' | null>(null)
  const lastList = getLastList()

  return (
    <Page
      title={t('start.title')}
      menu={[
        { label: t('newList.title'), icon: 'newList', onSelect: () => setDialog('list'), disabled: !spaces?.length },
        { label: t('spaces.title'), icon: 'spaces', onSelect: () => navigate('/spaces') },
        'divider',
        { label: t('nav.settings'), icon: 'settings', onSelect: () => navigate('/settings') },
      ]}
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
        <SpaceLists key={space.id} space={space} showName={spaces.length > 1} lastListId={lastList?.listId} onNewList={() => setDialog('list')} />
      ))}
      {dialog === 'list' && spaces && (
        <NewListDialog
          spaces={spaces}
          defaultSpaceId={spaces.some((s) => s.id === lastList?.spaceId) ? lastList?.spaceId : undefined}
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
  return (
    <section aria-label={props.space.name}>
      {props.showName ? <SectionTitle>{props.space.name}</SectionTitle> : <div className="h-3" />}
      {lists === undefined && <Loading />}
      {lists?.length === 0 && (
        <Hint>
          {t('start.noLists')}{' '}
          <button type="button" onClick={props.onNewList} className="font-semibold text-accent underline">
            {t('newList.title')}
          </button>
        </Hint>
      )}
      {lists?.map((list) => {
        const open = list.items.filter((i) => !i.checked)
        const preview = open.length ? open.slice(0, 4).map((i) => i.name).join(', ') + (open.length > 4 ? ' …' : '') : t('start.allDone')
        return (
          <Link
            key={list.id}
            to={`/spaces/${props.space.id}/lists/${list.id}`}
            className="flex items-center gap-3 border-b border-line px-2 py-3.5 hover:bg-raised"
          >
            <span className="min-w-0 flex-1">
              <span className="text-xl font-semibold">{list.name}</span>
              {list.id === props.lastListId && <span className="text-sm font-semibold text-accent"> · {t('start.lastUsed')}</span>}
              <span className="block truncate text-muted">{preview}</span>
            </span>
            <span
              aria-label={t('lists.openCount', { count: open.length })}
              className={`flex h-8 min-w-8 items-center justify-center rounded-full bg-raised px-2.5 tabular-nums ${open.length ? 'font-semibold' : 'text-muted'}`}
            >
              {open.length || '✓'}
            </span>
          </Link>
        )
      })}
    </section>
  )
}
