import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router'
import { spaceKeys, spacesApi } from '../../api/spaces'
import { Page } from '../../components/AppBar'
import { Button, ErrorText, Loading } from '../../components/ui'
import { t } from '../../i18n/messages'

/** Target of an invite link `/invite/<token>`. Behind RequireAuth, so the user is logged in here. */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => spacesApi.previewInvite(token), retry: false })
  const accept = useMutation({
    mutationFn: () => spacesApi.acceptInvite(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all })
      // The start page shows the lists of the new space right away.
      navigate('/', { replace: true })
    },
  })

  if (preview.error) {
    return (
      <Page title={t('invite.title')}>
        <div className="py-4"><ErrorText error={preview.error} /></div>
      </Page>
    )
  }
  if (!preview.data) return <Page title={t('invite.title')}><Loading /></Page>
  if (preview.data.alreadyMember) return <Navigate to="/" replace />

  return (
    <Page title={t('invite.title')}>
      <div className="space-y-4 py-6">
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
      </div>
    </Page>
  )
}
