import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { spaceKeys, spacesApi, useSpace, type CreatedInvite, type Member } from '../../api/spaces'
import { useCurrentUser } from '../../auth/useAuth'
import { Button, Card, ErrorText, Loading, PageTitle } from '../../components/ui'
import { t, tDynamic } from '../../i18n/messages'
import { OnlineOnly } from '../../offline/online'

export function MembersPage() {
  const { spaceId = '' } = useParams()
  const { data: space } = useSpace(spaceId)
  const { data: me } = useCurrentUser()
  const members = useQuery({ queryKey: spaceKeys.members(spaceId), queryFn: () => spacesApi.members(spaceId) })

  if (!space || !me) return <Loading />
  const isOwner = space.myRole === 'OWNER'

  return (
    <section className="space-y-6">
      <PageTitle action={<BackLink to={`/spaces/${spaceId}`} />}>{t('space.members')}</PageTitle>
      <ErrorText error={members.error} />
      <OnlineOnly>
      <ul className="space-y-2">
        {members.data?.map((member) => (
          <MemberRow key={member.userId} spaceId={spaceId} member={member} isMe={member.userId === me.id} canManage={isOwner} />
        ))}
      </ul>
      {isOwner && <InvitesSection spaceId={spaceId} />}
      </OnlineOnly>
    </section>
  )
}

export function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="text-sm text-green-700 underline dark:text-green-400">
      {t('common.back')}
    </Link>
  )
}

function MemberRow({ spaceId, member, isMe, canManage }: { spaceId: string; member: Member; isMe: boolean; canManage: boolean }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => queryClient.invalidateQueries({ queryKey: spaceKeys.all })
  const remove = useMutation({ mutationFn: () => spacesApi.removeMember(spaceId, member.userId), onSuccess: refresh })
  const transfer = useMutation({ mutationFn: () => spacesApi.transferOwnership(spaceId, member.userId), onSuccess: refresh })
  const leave = useMutation({
    mutationFn: () => spacesApi.leave(spaceId),
    onSuccess: () => {
      refresh()
      navigate('/')
    },
  })

  return (
    <li>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {member.displayName}
            {isMe && ` (${t('members.you')})`}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{tDynamic(`spaces.role.${member.role}`)}</span>
        </div>
        <ErrorText error={remove.error ?? transfer.error ?? leave.error} />
        <div className="flex flex-wrap gap-2">
          {canManage && !isMe && (
            <>
              <Button variant="secondary" onClick={() => window.confirm(t('members.transferConfirm', { name: member.displayName })) && transfer.mutate()}>
                {t('members.makeOwner')}
              </Button>
              <Button variant="secondary" onClick={() => window.confirm(t('members.removeConfirm', { name: member.displayName })) && remove.mutate()}>
                {t('members.remove')}
              </Button>
            </>
          )}
          {isMe && member.role === 'MEMBER' && (
            <Button variant="secondary" onClick={() => window.confirm(t('members.leaveConfirm')) && leave.mutate()}>
              {t('members.leave')}
            </Button>
          )}
        </div>
      </Card>
    </li>
  )
}

const EXPIRY_OPTIONS = [1, 24, 72, 168, 720]

function InvitesSection({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient()
  const [expiresInHours, setExpiresInHours] = useState(24)
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const invites = useQuery({ queryKey: spaceKeys.invites(spaceId), queryFn: () => spacesApi.invites(spaceId) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: spaceKeys.invites(spaceId) })
  const create = useMutation({
    mutationFn: () => spacesApi.createInvite(spaceId, expiresInHours),
    onSuccess: (invite) => {
      setCreated(invite)
      refresh()
    },
  })
  const revoke = useMutation({ mutationFn: (inviteId: string) => spacesApi.revokeInvite(spaceId, inviteId), onSuccess: refresh })

  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-semibold">{t('invites.title')}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('invites.explanation')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('invites.validFor')}</span>
          <select
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Number(e.target.value))}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900"
          >
            {EXPIRY_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {tDynamic(`invites.hours.${hours}`)}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {t('invites.create')}
        </Button>
      </div>
      <ErrorText error={create.error ?? revoke.error ?? invites.error} />
      {created && <CreatedInviteLink invite={created} />}
      {invites.data && invites.data.length > 0 && (
        <ul className="space-y-1">
          {invites.data.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{t('invites.openUntil', { date: new Date(invite.expiresAt).toLocaleString() })}</span>
              <Button variant="ghost" onClick={() => revoke.mutate(invite.id)}>
                {t('invites.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * The new link is shown once (only its hash is stored on the server). On phones the native share sheet
 * (Web Share API) is offered; elsewhere the link is copied to the clipboard.
 */
function CreatedInviteLink({ invite }: { invite: CreatedInvite }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'

  async function share() {
    if (canShare) {
      await navigator.share({ title: t('appName'), url: invite.url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(invite.url)
      setCopied(true)
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-green-50 p-3 dark:bg-green-950">
      <p className="text-sm">{t('invites.onceHint')}</p>
      <input readOnly value={invite.url} aria-label={t('invites.link')} onFocus={(e) => e.target.select()} className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900" />
      <Button onClick={share}>{canShare ? t('invites.share') : copied ? t('invites.copied') : t('invites.copy')}</Button>
    </div>
  )
}
