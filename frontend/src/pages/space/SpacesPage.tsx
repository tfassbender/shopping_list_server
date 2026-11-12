import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { spaceKeys, spacesApi, useSpaces } from '../../api/spaces'
import { Page } from '../../components/AppBar'
import { SortableList } from '../../components/SortableList'
import { Avatar, ChevronRight, ErrorText, Hint, LoadError, Loading, Row, Fab } from '../../components/ui'
import { t } from '../../i18n/messages'
import { useOnline } from '../../offline/online'
import { useSpaceLists } from '../../offline/engine'
import { NewSpaceDialog } from './SpaceDialogs'
import type { Space } from '../../api/spaces'

/**
 * "Spaces & sharing": one row per space; + creates a space. The ⠿ handles change the order of the
 * spaces (personal, saved on the server), which the start page uses as well.
 */
export function SpacesPage() {
  const { data: spaces, isPending, error, refetch } = useSpaces()
  const navigate = useNavigate()
  const online = useOnline()
  const [creating, setCreating] = useState(false)
  const reorder = useReorderSpaces(spaces)
  const open = (space: Space) => navigate(`/spaces/${space.id}`)
  // Reordering is saved on the server, so it needs a connection (and at least two spaces to make sense).
  const sortable = online && spaces !== undefined && spaces.length > 1

  return (
    <Page title={t('spaces.title')} back="/">
      <Hint>{t('spaces.explanation')}</Hint>
      {isPending && <Loading />}
      {error && !spaces && <LoadError error={error} onRetry={() => void refetch()} />}
      <ErrorText error={reorder.error} />
      {sortable ? (
        <>
          <p className="mb-2 text-sm text-muted">{t('spaces.orderHint')}</p>
          <SortableList
            items={spaces}
            getId={(space) => space.id}
            getLabel={(space) => space.name}
            onReorder={(ids) => reorder.mutate(ids)}
            renderItem={(space) => <SpaceRow space={space} onOpen={() => open(space)} plain />}
          />
        </>
      ) : (
        spaces?.map((space) => <SpaceRow key={space.id} space={space} onOpen={() => open(space)} />)
      )}
      <Fab label={t('spaces.new')} onClick={() => setCreating(true)} disabled={!online} />
      {creating && <NewSpaceDialog onClose={() => setCreating(false)} onCreated={(space) => navigate(`/spaces/${space.id}`)} />}
    </Page>
  )
}

/** Shows the new order at once, then saves it; on failure the server's order comes back. */
function useReorderSpaces(spaces: Space[] | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    // One after the other, so a quick second move can't be overtaken by the first one.
    scope: { id: 'space-order' },
    onMutate: (ids: string[]) => {
      const byId = new Map(spaces?.map((s) => [s.id, s]))
      queryClient.setQueryData(spaceKeys.all, ids.map((id) => byId.get(id)!))
    },
    mutationFn: (ids: string[]) => spacesApi.reorder(ids),
    onError: () => queryClient.invalidateQueries({ queryKey: spaceKeys.all, exact: true }),
  })
}

/** `plain`: inside the sortable list, which draws the frame and the lines between rows itself. */
function SpaceRow({ space, onOpen, plain }: { space: Space; onOpen: () => void; plain?: boolean }) {
  const lists = useSpaceLists(space.id)
  const listCount = lists?.length ?? 0
  const summary = t('spaces.summary', {
    lists: listCount === 1 ? t('spaces.lists.one') : t('spaces.lists.other', { count: listCount }),
    members: space.memberCount === 1 ? t('spaces.members.one') : t('spaces.members.other', { count: space.memberCount }),
  })
  const role = space.myRole === 'OWNER' ? t('spaces.role.OWNER') : t('spaces.role.MEMBER')
  const title = <span className="text-xl font-semibold">{space.name}</span>
  const hint = `${summary} · ${role}`
  if (!plain) return <Row onClick={onOpen} start={<Avatar name={space.name} />} title={title} hint={hint} chevron />
  return (
    <button type="button" onClick={onOpen} className="flex min-h-15 w-full items-center gap-3 py-2 pr-2 text-left hover:bg-raised">
      <Avatar name={space.name} />
      <span className="min-w-0 flex-1 wrap-anywhere">
        <span className="block">{title}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <ChevronRight />
    </button>
  )
}
