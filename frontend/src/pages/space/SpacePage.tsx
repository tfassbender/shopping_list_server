import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { newId } from '../../api/lists'
import { spaceKeys, spacesApi, useSpace } from '../../api/spaces'
import { InlineForm } from '../../components/InlineForm'
import { Button, Card, ErrorText, Loading, PageTitle } from '../../components/ui'
import { t } from '../../i18n/messages'
import { syncEngine, useSpaceLists } from '../../offline/engine'
import { OnlineOnly } from '../../offline/online'

/** A space: its lists plus links to members and (owner) rename/delete. */
export function SpacePage() {
  const { spaceId = '' } = useParams()
  const { data: space, error } = useSpace(spaceId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)

  const rename = useMutation({
    mutationFn: (name: string) => spacesApi.rename(spaceId, name),
    onSuccess: () => {
      setRenaming(false)
      queryClient.invalidateQueries({ queryKey: spaceKeys.all })
    },
  })
  const remove = useMutation({
    mutationFn: () => spacesApi.delete(spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all })
      navigate('/')
    },
  })

  if (error) return <ErrorText error={error} />
  if (!space) return <Loading />
  const isOwner = space.myRole === 'OWNER'

  return (
    <section className="space-y-6">
      {renaming ? (
        <InlineForm label={t('common.name')} submitLabel={t('common.save')} initialValue={space.name} onSubmit={(name) => rename.mutate(name)} onCancel={() => setRenaming(false)} />
      ) : (
        <PageTitle>{space.name}</PageTitle>
      )}
      <ErrorText error={rename.error ?? remove.error} />

      <SpaceLists spaceId={spaceId} />

      <nav className="flex flex-wrap gap-2">
        <SpaceLink to={`/spaces/${spaceId}/members`}>{t('space.members')}</SpaceLink>
        <SpaceLink to={`/spaces/${spaceId}/catalog`}>{t('space.catalog')}</SpaceLink>
        <SpaceLink to={`/spaces/${spaceId}/layouts`}>{t('space.layouts')}</SpaceLink>
      </nav>

      {isOwner && (
        <OnlineOnly>
        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button variant="secondary" onClick={() => setRenaming(true)}>
            {t('space.rename')}
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => window.confirm(t('space.deleteConfirm', { name: space.name })) && remove.mutate()}
          >
            {t('space.delete')}
          </Button>
        </div>
        </OnlineOnly>
      )}
    </section>
  )
}

export function SpaceLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      {children}
    </Link>
  )
}

/** The lists come from the offline sync engine, so they can be created and opened without connection. */
function SpaceLists({ spaceId }: { spaceId: string }) {
  const lists = useSpaceLists(spaceId)
  const navigate = useNavigate()

  function create(name: string) {
    const listId = newId()
    syncEngine.enqueue(spaceId, { type: 'CREATE_LIST', listId, name })
    navigate(`/spaces/${spaceId}/lists/${listId}`)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{t('lists.title')}</h3>
      {lists === undefined && <Loading />}
      {lists?.length === 0 && <p className="text-gray-500 dark:text-gray-400">{t('lists.empty')}</p>}
      <ul className="space-y-2">
        {lists?.map((list) => (
          <li key={list.id}>
            <Link to={`/spaces/${spaceId}/lists/${list.id}`} className="block">
              <Card className="flex items-center justify-between hover:border-green-500">
                <span className="text-lg font-medium">{list.name}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('lists.openCount', { count: list.items.filter((i) => !i.checked).length })}
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <InlineForm label={t('lists.newName')} submitLabel={t('common.create')} clearOnSubmit onSubmit={create} />
    </div>
  )
}
