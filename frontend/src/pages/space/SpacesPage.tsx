import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSpaces } from '../../api/spaces'
import { Page } from '../../components/AppBar'
import { Avatar, Hint, LoadError, Loading, Row, Fab } from '../../components/ui'
import { t } from '../../i18n/messages'
import { useOnline } from '../../offline/online'
import { useSpaceLists } from '../../offline/engine'
import { NewSpaceDialog } from './SpaceDialogs'
import type { Space } from '../../api/spaces'

/** "Spaces & sharing": one row per space; + creates a space. */
export function SpacesPage() {
  const { data: spaces, isPending, error, refetch } = useSpaces()
  const navigate = useNavigate()
  const online = useOnline()
  const [creating, setCreating] = useState(false)

  return (
    <Page title={t('spaces.title')} back="/">
      <Hint>{t('spaces.explanation')}</Hint>
      {isPending && <Loading />}
      {error && !spaces && <LoadError error={error} onRetry={() => void refetch()} />}
      {spaces?.map((space) => (
        <SpaceRow key={space.id} space={space} onOpen={() => navigate(`/spaces/${space.id}`)} />
      ))}
      <Fab label={t('spaces.new')} onClick={() => setCreating(true)} disabled={!online} />
      {creating && <NewSpaceDialog onClose={() => setCreating(false)} onCreated={(space) => navigate(`/spaces/${space.id}`)} />}
    </Page>
  )
}

function SpaceRow({ space, onOpen }: { space: Space; onOpen: () => void }) {
  const lists = useSpaceLists(space.id)
  const listCount = lists?.length ?? 0
  const summary = t('spaces.summary', {
    lists: listCount === 1 ? t('spaces.lists.one') : t('spaces.lists.other', { count: listCount }),
    members: space.memberCount === 1 ? t('spaces.members.one') : t('spaces.members.other', { count: space.memberCount }),
  })
  const role = space.myRole === 'OWNER' ? t('spaces.role.OWNER') : t('spaces.role.MEMBER')
  return (
    <Row
      onClick={onOpen}
      start={<Avatar name={space.name} />}
      title={<span className="text-xl font-semibold">{space.name}</span>}
      hint={`${summary} · ${role}`}
      chevron
    />
  )
}
