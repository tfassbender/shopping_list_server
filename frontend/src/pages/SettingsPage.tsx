import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { apiTokensApi } from '../api/apiTokens'
import { accountApi, type User, type UserSettings } from '../api/auth'
import { useHealth } from '../api/health'
import { useAuthActions, useCurrentUser } from '../auth/useAuth'
import { Page } from '../components/AppBar'
import { ConfirmDialog, Dialog, DialogActions } from '../components/Dialog'
import { Button, ErrorText, Loading, Row, SectionTitle, Segmented, SuccessText, Switch, TextField } from '../components/ui'
import { isKeepScreenOnSupported, setKeepScreenOn, useKeepScreenOnSetting } from '../device/keepScreenOn'
import { t } from '../i18n/messages'
import { OnlineOnly } from '../offline/online'
import { NameDialog } from './space/SpaceDialogs'

type DialogName = 'name' | 'password' | 'logoutEverywhere' | 'delete' | null

/**
 * Settings in plain sections: profile, display, AI agents, account. Display choices apply at once;
 * everything else opens a dialog. Needs a connection (settings are stored on the server).
 */
export function SettingsPage() {
  const { data: user } = useCurrentUser()
  const keepScreenOn = useKeepScreenOnSetting()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { startSession, logout } = useAuthActions()
  const health = useHealth()
  const tokens = useQuery({ queryKey: ['apiTokens'], queryFn: apiTokensApi.list })
  const [dialog, setDialog] = useState<DialogName>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const setUser = (updated: User) => queryClient.setQueryData(['me'], updated)
  const updateSettings = useMutation({ mutationFn: accountApi.updateSettings, onSuccess: setUser })
  const rename = useMutation({
    mutationFn: accountApi.updateDisplayName,
    onSuccess: (updated) => {
      setUser(updated)
      setDialog(null)
    },
  })
  const logoutEverywhere = useMutation({
    mutationFn: accountApi.logoutEverywhere,
    onSuccess: (response) => {
      startSession(response)
      setNotice(t('settings.loggedOutEverywhere'))
    },
  })
  const deleteAccount = useMutation({
    mutationFn: accountApi.deleteAccount,
    onSuccess: () => {
      logout('/register')
    },
  })

  if (!user) {
    return (
      <Page title={t('settings.title')} back="/">
        <Loading />
      </Page>
    )
  }
  const change = (patch: Partial<UserSettings>) => updateSettings.mutate({ ...user.settings, ...patch })

  return (
    <Page title={t('settings.title')} back="/">
      <OnlineOnly>
        <ErrorText error={updateSettings.error ?? logoutEverywhere.error ?? deleteAccount.error} />
        {notice && <SuccessText>{notice}</SuccessText>}

        <SectionTitle>{t('settings.profile')}</SectionTitle>
        <Row onClick={() => setDialog('name')} title={t('auth.displayName')} hint={t('auth.displayNameHint')} end={<span className="min-w-0 truncate text-muted">{user.displayName}</span>} chevron />
        <Row title={t('auth.email')} end={<span className="min-w-0 truncate text-muted">{user.email}</span>} />

        <SectionTitle>{t('settings.appearance')}</SectionTitle>
        <div className="space-y-2 border-b border-line px-2 py-3">
          <span className="block">{t('settings.language')}</span>
          <Segmented
            label={t('settings.language')}
            options={[
              { value: 'de', label: t('settings.language.de') },
              { value: 'en', label: t('settings.language.en') },
            ]}
            value={user.settings.language}
            onChange={(language) => change({ language })}
          />
        </div>
        <div className="space-y-2 border-b border-line px-2 py-3">
          <span className="block">{t('settings.theme')}</span>
          <Segmented
            label={t('settings.theme')}
            options={(['SYSTEM', 'LIGHT', 'DARK'] as const).map((value) => ({ value, label: t(`settings.theme.${value}`) }))}
            value={user.settings.theme}
            onChange={(theme) => change({ theme })}
          />
        </div>
        <label className="flex min-h-15 items-center gap-3 border-b border-line px-2 py-2">
          <span className="min-w-0 flex-1">
            {t('settings.mergeNotes')}
            <span className="block text-sm text-muted">{t('settings.mergeNotesHint')}</span>
          </span>
          {/* Stored as "ignore merge warnings" - the switch shows the positive form. */}
          <Switch
            label={t('settings.mergeNotes')}
            checked={!user.settings.ignoreMergeWarnings}
            onChange={(show) => change({ ignoreMergeWarnings: !show })}
          />
        </label>
        {isKeepScreenOnSupported() && (
          <label className="flex min-h-15 items-center gap-3 border-b border-line px-2 py-2">
            <span className="min-w-0 flex-1">
              {t('settings.keepScreenOn')}
              <span className="block text-sm text-muted">{t('settings.keepScreenOnHint')}</span>
            </span>
            <Switch label={t('settings.keepScreenOn')} checked={keepScreenOn} onChange={setKeepScreenOn} />
          </label>
        )}

        <SectionTitle>{t('settings.aiAgents')}</SectionTitle>
        <Row
          onClick={() => navigate('/settings/api-tokens')}
          title={t('tokens.title')}
          hint={t('settings.tokensHint')}
          end={<span className="text-muted">{tokens.data?.length ?? ''}</span>}
          chevron
        />

        <SectionTitle>{t('settings.account')}</SectionTitle>
        <Row onClick={() => setDialog('password')} title={t('settings.password')} chevron />
        <Row onClick={() => setDialog('logoutEverywhere')} title={t('settings.logoutEverywhere')} />
        <Row
          onClick={() => logout()}
          title={t('nav.logout')}
        />
        <Row onClick={() => setDialog('delete')} title={t('settings.deleteAccount')} danger />
        <p className="px-2 pt-6 text-sm text-muted">
          {t('appName')} {health.data ? t('settings.version', { version: health.data.version }) : ''}
        </p>
      </OnlineOnly>

      {dialog === 'name' && (
        <NameDialog
          title={t('auth.displayName')}
          label={t('auth.displayName')}
          initialValue={user.displayName}
          maxLength={40}
          submitLabel={t('common.save')}
          pending={rename.isPending}
          error={rename.error}
          onSubmit={(name) => rename.mutate(name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'password' && (
        <PasswordDialog
          onDone={() => {
            setDialog(null)
            setNotice(t('settings.passwordChanged'))
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'logoutEverywhere' && (
        <ConfirmDialog
          title={t('settings.logoutEverywhereTitle')}
          text={t('settings.logoutEverywhereConfirm')}
          confirmLabel={t('settings.logoutEverywhereButton')}
          onConfirm={() => logoutEverywhere.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('settings.deleteAccountTitle')}
          text={t('settings.deleteAccountConfirm')}
          confirmLabel={t('settings.deleteAccount')}
          onConfirm={() => deleteAccount.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
    </Page>
  )
}

/** Change password; the answer is a new session (all other devices are logged out). */
function PasswordDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { startSession } = useAuthActions()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    onSuccess: (response) => {
      startSession(response)
      onDone()
    },
  })
  return (
    <Dialog title={t('settings.password')} onClose={onClose} onSubmit={() => change.mutate()}>
      <TextField label={t('auth.currentPassword')} type="password" autoComplete="current-password" required autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
      <TextField label={t('auth.newPassword')} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      <p className="text-sm text-muted">{t('settings.passwordHint')}</p>
      <ErrorText error={change.error} />
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={change.isPending}>
          {t('settings.passwordChange')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
