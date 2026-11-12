import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useCatalog, useHistory } from '../../api/catalog'
import { ApiError } from '../../api/client'
import { useLayouts } from '../../api/layouts'
import { spaceKeys, spacesApi, useSpace, type CreatedInvite, type Member } from '../../api/spaces'
import { useCurrentUser } from '../../auth/useAuth'
import { Page, type MenuEntry } from '../../components/AppBar'
import { ConfirmDialog, Dialog, DialogActions } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { Avatar, Button, ErrorText, Hint, LoadError, Loading, Row, SectionTitle, Segmented } from '../../components/ui'
import { t, type MessageKey } from '../../i18n/messages'
import { syncEngine } from '../../offline/engine'
import { OnlineOnly } from '../../offline/online'
import { NameDialog } from './SpaceDialogs'

type Confirm = { title: string; text: string; confirmLabel: string; onConfirm: () => void }

/**
 * A space: its members, open invite links (owner) and what all its lists share (categories, shops).
 * Rename and delete (owner) or leave (member) are in the ⋮ menu. Everything here needs a connection.
 */
export function SpacePage() {
  const { spaceId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: space, error, refetch } = useSpace(spaceId)
  const { data: me } = useCurrentUser()
  const members = useQuery({ queryKey: spaceKeys.members(spaceId), queryFn: () => spacesApi.members(spaceId) })
  const { data: catalog } = useCatalog(spaceId)
  const { data: layouts } = useLayouts(spaceId)
  const { data: history } = useHistory(spaceId)
  const [dialog, setDialog] = useState<'rename' | 'invite' | null>(null)
  const [memberDialog, setMemberDialog] = useState<Member | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: spaceKeys.all })
  const gone = () => {
    void syncEngine.sync(spaceId) // the sync notices the missing access and drops the offline data
    navigate('/spaces', { replace: true }) // browser back shouldn't lead to the deleted space
    // Forget the space's cached data (instead of refetching it, which only gives 404s now).
    queryClient.removeQueries({ queryKey: spaceKeys.detail(spaceId) })
    void queryClient.invalidateQueries({ queryKey: spaceKeys.all, exact: true })
  }
  const rename = useMutation({
    mutationFn: (name: string) => spacesApi.rename(spaceId, name),
    onSuccess: () => {
      void refresh()
      setDialog(null)
    },
  })
  const remove = useMutation({ mutationFn: () => spacesApi.delete(spaceId), onSuccess: gone })
  const leave = useMutation({ mutationFn: () => spacesApi.leave(spaceId), onSuccess: gone })
  const removeMember = useMutation({ mutationFn: (userId: string) => spacesApi.removeMember(spaceId, userId), onSuccess: refresh })
  const makeOwner = useMutation({ mutationFn: (userId: string) => spacesApi.transferOwnership(spaceId, userId), onSuccess: refresh })

  // A 404 means the space is gone (or the user was removed): don't show cached data below the error.
  if (error && (!space || (error instanceof ApiError && error.status === 404))) {
    return (
      <Page title={t('spaces.title')} back="/spaces">
        <LoadError error={error} onRetry={() => void refetch()} />
      </Page>
    )
  }
  if (!space || !me) {
    return (
      <Page title={t('spaces.title')} back="/spaces">
        <Loading />
      </Page>
    )
  }
  const isOwner = space.myRole === 'OWNER'

  const menu: MenuEntry[] = isOwner
    ? [
        { label: t('space.rename'), icon: 'rename', onSelect: () => setDialog('rename') },
        'divider',
        {
          label: t('space.delete'),
          icon: 'delete',
          danger: true,
          onSelect: () =>
            setConfirm({
              title: t('space.deleteTitle', { name: space.name }),
              text: t('space.deleteConfirm', { name: space.name }),
              confirmLabel: t('space.delete'),
              onConfirm: () => remove.mutate(),
            }),
        },
      ]
    : [
        {
          label: t('members.leave'),
          icon: 'leave',
          danger: true,
          onSelect: () =>
            setConfirm({
              title: t('members.leaveTitle', { name: space.name }),
              text: t('members.leaveConfirm'),
              confirmLabel: t('members.leave'),
              onConfirm: () => leave.mutate(),
            }),
        },
      ]

  function askMakeOwner(member: Member) {
    setMemberDialog(null)
    setConfirm({
      title: t('members.transferTitle', { name: member.displayName }),
      text: t('members.transferConfirm', { name: member.displayName }),
      confirmLabel: t('members.makeOwner'),
      onConfirm: () => makeOwner.mutate(member.userId),
    })
  }

  function askRemove(member: Member) {
    setMemberDialog(null)
    setConfirm({
      title: t('members.removeTitle', { name: member.displayName }),
      text: t('members.removeConfirm', { name: member.displayName, space: space!.name }),
      confirmLabel: t('members.remove'),
      onConfirm: () => removeMember.mutate(member.userId),
    })
  }

  return (
    <Page title={space.name} back="/spaces" menu={menu}>
      <OnlineOnly>
        <ErrorText error={members.error ?? rename.error ?? remove.error ?? leave.error ?? removeMember.error ?? makeOwner.error} />
        <SectionTitle>{t('space.members')}</SectionTitle>
        {members.data?.map((member) => (
          <Row
            key={member.userId}
            start={<Avatar name={member.displayName} />}
            title={
              <>
                {member.displayName}
                {member.userId === me.id && <span className="text-muted"> ({t('members.you')})</span>}
              </>
            }
            hint={t(member.role === 'OWNER' ? 'spaces.role.OWNER' : 'spaces.role.MEMBER')}
            end={
              isOwner && member.userId !== me.id ? (
                <button
                  type="button"
                  aria-label={t('members.options', { name: member.displayName })}
                  onClick={() => setMemberDialog(member)}
                  className="flex size-12 items-center justify-center text-muted hover:text-fg"
                >
                  <Icon name="more" className="text-lg" />
                </button>
              ) : undefined
            }
          />
        ))}
        {isOwner ? (
          <div className="py-4">
            <Button onClick={() => setDialog('invite')}>{t('invites.title')}</Button>
          </div>
        ) : (
          <Hint>{t('space.onlyOwnerInvites')}</Hint>
        )}
        {isOwner && <OpenInvites spaceId={spaceId} />}
        <SectionTitle>{t('space.usedByLists')}</SectionTitle>
        <Row
          onClick={() => navigate(`/spaces/${spaceId}/catalog`)}
          title={t('space.catalog')}
          hint={t('space.categoryCount', { count: catalog?.categories.length ?? 0 })}
          chevron
        />
        <Row
          onClick={() => navigate(`/spaces/${spaceId}/history`)}
          title={t('history.title')}
          hint={t('history.count', { count: history?.length ?? 0 })}
          chevron
        />
        <Row
          onClick={() => navigate(`/spaces/${spaceId}/layouts`)}
          title={t('space.layouts')}
          hint={layouts?.length ? layouts.map((l) => l.name).join(', ') : t('layouts.empty')}
          chevron
        />
      </OnlineOnly>

      {dialog === 'rename' && (
        <NameDialog
          title={t('space.rename')}
          initialValue={space.name}
          submitLabel={t('common.save')}
          pending={rename.isPending}
          error={rename.error}
          onSubmit={(name) => rename.mutate(name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'invite' && <InviteDialog spaceId={spaceId} onClose={() => setDialog(null)} />}
      {memberDialog && (
        <Dialog title={memberDialog.displayName} onClose={() => setMemberDialog(null)}>
          <div>
            <button type="button" onClick={() => askMakeOwner(memberDialog)} className="block w-full border-b border-line py-3 text-left text-lg">
              {t('members.makeOwner')}
              <span className="block text-sm text-muted">{t('members.makeOwnerHint')}</span>
            </button>
            <button type="button" onClick={() => askRemove(memberDialog)} className="block w-full py-3 text-left text-lg text-danger">
              {t('members.remove')}
              <span className="block text-sm text-muted">{t('members.removeConfirm', { name: memberDialog.displayName, space: space.name })}</span>
            </button>
          </div>
        </Dialog>
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </Page>
  )
}

/** Open (unused, unexpired) invite links with "Revoke". */
function OpenInvites({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: spaceKeys.invites(spaceId), queryFn: () => spacesApi.invites(spaceId) })
  const revoke = useMutation({
    mutationFn: (inviteId: string) => spacesApi.revokeInvite(spaceId, inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spaceKeys.invites(spaceId) }),
  })
  if (!invites.data?.length) return null
  return (
    <>
      <SectionTitle>{t('invites.open')}</SectionTitle>
      <ErrorText error={revoke.error} />
      {invites.data.map((invite) => (
        <Row
          key={invite.id}
          title={t('invites.forOnePerson')}
          hint={t('invites.validUntil', { date: new Date(invite.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) })}
          end={
            <Button variant="secondary" onClick={() => revoke.mutate(invite.id)}>
              {t('invites.revoke')}
            </Button>
          }
        />
      ))}
    </>
  )
}

const VALIDITY: { hours: string; label: MessageKey }[] = [
  { hours: '1', label: 'invites.hours.1' },
  { hours: '24', label: 'invites.hours.24' },
  { hours: '168', label: 'invites.hours.168' },
]

/**
 * Invite someone: first how long the link is valid, then the link - shown once (the server stores only
 * a hash) with Copy and, on phones, Share (the system's share menu via the Web Share API).
 */
function InviteDialog({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [hours, setHours] = useState('24')
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () => spacesApi.createInvite(spaceId, Number(hours)),
    onSuccess: (invite) => {
      setCreated(invite)
      void queryClient.invalidateQueries({ queryKey: spaceKeys.invites(spaceId) })
    },
  })
  const validityLabel = t(VALIDITY.find((v) => v.hours === hours)!.label)

  if (created) {
    return (
      <Dialog title={t('invites.linkTitle')} onClose={onClose}>
        <input
          readOnly
          aria-label={t('invites.link')}
          value={created.url}
          onFocus={(e) => e.target.select()}
          className="block w-full rounded-lg border border-line bg-raised px-3 py-3 font-mono text-sm"
        />
        <p className="text-muted">{t('invites.onceHint', { validity: validityLabel })}</p>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
          {typeof navigator.share === 'function' && (
            <Button variant="secondary" onClick={() => void navigator.share({ title: t('appName'), url: created.url }).catch(() => {})}>
              {t('invites.share')}
            </Button>
          )}
          <Button
            onClick={() =>
              void navigator.clipboard
                .writeText(created.url)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            {copied ? t('invites.copied') : t('invites.copy')}
          </Button>
        </DialogActions>
      </Dialog>
    )
  }
  return (
    <Dialog title={t('invites.title')} onClose={onClose}>
      <p className="text-muted">{t('invites.explanation')}</p>
      <div className="space-y-2">
        <span className="block text-sm text-muted">{t('invites.validFor')}</span>
        <Segmented label={t('invites.validFor')} options={VALIDITY.map((v) => ({ value: v.hours, label: t(v.label) }))} value={hours} onChange={setHours} />
      </div>
      <ErrorText error={create.error} />
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {t('invites.create')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
