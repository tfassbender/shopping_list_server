import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router'
import { spaceKeys, spacesApi } from '../../api/spaces'
import { Button, Card, ErrorText, Loading, PageTitle } from '../../components/ui'
import { t } from '../../i18n/messages'

/** Target of an invite link `/invite/<token>`. Behind RequireAuth, so the user is logged in here. */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => spacesApi.previewInvite(token), retry: false })
  const accept = useMutation({
    mutationFn: () => spacesApi.acceptInvite(token),
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all })
      navigate(`/spaces/${space.id}`, { replace: true })
    },
  })

  if (preview.error) {
    return (
      <section>
        <PageTitle>{t('invite.title')}</PageTitle>
        <ErrorText error={preview.error} />
      </section>
    )
  }
  if (!preview.data) return <Loading />
  if (preview.data.alreadyMember) return <Navigate to="/" replace />

  return (
    <section>
      <PageTitle>{t('invite.title')}</PageTitle>
      <Card className="space-y-4">
        <p>{t('invite.question', { name: preview.data.invitedBy, space: preview.data.spaceName })}</p>
        <ErrorText error={accept.error} />
        <div className="flex gap-2">
          <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
            {t('invite.accept')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/')}>
            {t('common.cancel')}
          </Button>
        </div>
      </Card>
    </section>
  )
}
