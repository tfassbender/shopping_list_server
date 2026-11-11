import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { spaceKeys, spacesApi, useSpace } from '../../api/spaces'
import { InlineForm } from '../../components/InlineForm'
import { Button, ErrorText, Loading, PageTitle } from '../../components/ui'
import { t } from '../../i18n/messages'

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

      <SpaceLists spaceId={spaceId} isOwner={isOwner} />

      <nav className="flex flex-wrap gap-2">
        <SpaceLink to={`/spaces/${spaceId}/members`}>{t('space.members')}</SpaceLink>
      </nav>

      {isOwner && (
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

/** Placeholder until the lists of a space exist (Phase 3). */
function SpaceLists(_props: { spaceId: string; isOwner: boolean }) {
  return null
}
