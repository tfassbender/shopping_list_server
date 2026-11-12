import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { spaceKeys, spacesApi } from '../../api/spaces'
import { Page } from '../../components/AppBar'
import { Button, ErrorText, Hint, Loading } from '../../components/ui'
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

  // Invalid/used link or already a member: say so and offer the way to the start page (no dead end).
  if (preview.error) {
    return (
      <Page title={t('invite.title')} back="/">
        <div className="space-y-4 py-4">
          <ErrorText error={preview.error} />
          <ToStart />
        </div>
      </Page>
    )
  }
  if (!preview.data) return <Page title={t('invite.title')} back="/"><Loading /></Page>
  if (preview.data.alreadyMember) {
    return (
      <Page title={t('invite.title')} back="/">
        <div className="space-y-4 py-4">
          <Hint>{t('invite.alreadyMember', { space: preview.data.spaceName })}</Hint>
          <ToStart />
        </div>
      </Page>
    )
  }

  return (
    <Page title={t('invite.title')} back="/">
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

function ToStart() {
  return (
    <Link to="/" replace className="inline-block py-2 font-semibold text-accent underline">
      {t('nav.toStart')}
    </Link>
  )
}
