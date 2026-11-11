import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { spaceKeys, spacesApi, useSpaces } from '../api/spaces'
import { HealthIndicator } from '../components/HealthIndicator'
import { InlineForm } from '../components/InlineForm'
import { Card, ErrorText, Loading, PageTitle } from '../components/ui'
import { t } from '../i18n/messages'
import { OnlineOnly } from '../offline/online'

/** Start page: the user's spaces. A space holds lists and is shared with its members. */
export function HomePage() {
  const { data: spaces, isPending, error } = useSpaces()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: spacesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spaceKeys.all }),
  })

  return (
    <section className="space-y-4">
      <PageTitle>{t('spaces.title')}</PageTitle>
      {isPending && <Loading />}
      <ErrorText error={error} />
      {spaces?.length === 0 && <p className="text-gray-600 dark:text-gray-400">{t('spaces.empty')}</p>}
      <ul className="space-y-2">
        {spaces?.map((space) => (
          <li key={space.id}>
            <Link to={`/spaces/${space.id}`} className="block">
              <Card className="flex items-center justify-between hover:border-green-500">
                <span className="text-lg font-medium">{space.name}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('spaces.memberCount', { count: space.memberCount })}
                  {space.myRole === 'OWNER' ? ` · ${t('spaces.role.OWNER')}` : ''}
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <OnlineOnly>
        <InlineForm label={t('spaces.newName')} submitLabel={t('common.create')} clearOnSubmit disabled={create.isPending} onSubmit={(name) => create.mutate(name)} />
      </OnlineOnly>
      <ErrorText error={create.error} />
      <HealthIndicator />
    </section>
  )
}
