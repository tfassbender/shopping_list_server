import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { accountApi, type User, type UserSettings } from '../api/auth'
import { useAuthActions, useCurrentUser } from '../auth/useAuth'
import { Button, Card, ErrorText, Loading, PageTitle, SuccessText, TextField } from '../components/ui'
import { t, tDynamic } from '../i18n/messages'
import { OnlineOnly } from '../offline/online'
import { ApiTokensSection } from './settings/ApiTokensSection'

export function SettingsPage() {
  const { data: user } = useCurrentUser()
  if (!user) return <Loading />
  return (
    <section className="space-y-4">
      <PageTitle>{t('settings.title')}</PageTitle>
      <OnlineOnly>
      <div className="space-y-4">
      <ProfileSection user={user} />
      <DisplaySection user={user} />
      <PasswordSection />
      <ApiTokensSection />
      <SessionSection />
      <DeleteAccountSection />
      </div>
      </OnlineOnly>
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </Card>
  )
}

function useUpdateUser<T>(call: (arg: T) => Promise<User>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: call, onSuccess: (user) => queryClient.setQueryData(['me'], user) })
}

function ProfileSection({ user }: { user: User }) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const rename = useUpdateUser(accountApi.updateDisplayName)

  function submit(event: FormEvent) {
    event.preventDefault()
    rename.mutate(displayName)
  }

  return (
    <Section title={t('settings.profile')}>
      <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
      <form onSubmit={submit} className="space-y-3">
        <TextField label={t('auth.displayName')} required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <ErrorText error={rename.error} />
        {rename.isSuccess && <SuccessText>{t('common.saved')}</SuccessText>}
        <Button type="submit" disabled={rename.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Section>
  )
}

/** Display settings are saved immediately on change (no save button). */
function DisplaySection({ user }: { user: User }) {
  const update = useUpdateUser(accountApi.updateSettings)
  const settings = user.settings
  const change = (patch: Partial<UserSettings>) => update.mutate({ ...settings, ...patch })

  return (
    <Section title={t('settings.appearance')}>
      <SelectField
        label={t('settings.theme')}
        value={settings.theme}
        options={['SYSTEM', 'LIGHT', 'DARK'].map((v) => [v, tDynamic(`settings.theme.${v}`)])}
        onChange={(theme) => change({ theme: theme as UserSettings['theme'] })}
      />
      <SelectField
        label={t('settings.language')}
        value={settings.language}
        options={['en', 'de'].map((v) => [v, tDynamic(`settings.language.${v}`)])}
        onChange={(language) => change({ language: language as UserSettings['language'] })}
      />
      <Checkbox label={t('settings.checkedItemsToEnd')} checked={settings.checkedItemsToEnd} onChange={(v) => change({ checkedItemsToEnd: v })} />
      <Checkbox label={t('settings.ignoreMergeWarnings')} checked={settings.ignoreMergeWarnings} onChange={(v) => change({ ignoreMergeWarnings: v })} />
      <ErrorText error={update.error} />
    </Section>
  )
}

function SelectField(props: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900"
      >
        {props.options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Checkbox(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" className="size-5 accent-green-600" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  )
}

function PasswordSection() {
  const { startSession } = useAuthActions()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    onSuccess: (response) => {
      startSession(response)
      setCurrent('')
      setNext('')
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    change.mutate()
  }

  return (
    <Section title={t('settings.password')}>
      <form onSubmit={submit} className="space-y-3">
        <TextField label={t('auth.currentPassword')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField label={t('auth.newPassword')} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        <ErrorText error={change.error} />
        {change.isSuccess && <SuccessText>{t('settings.passwordChanged')}</SuccessText>}
        <Button type="submit" disabled={change.isPending}>
          {t('settings.password')}
        </Button>
      </form>
    </Section>
  )
}

function SessionSection() {
  const { startSession, logout } = useAuthActions()
  const navigate = useNavigate()
  const everywhere = useMutation({ mutationFn: accountApi.logoutEverywhere, onSuccess: startSession })
  return (
    <Section title={t('settings.sessions')}>
      <ErrorText error={everywhere.error} />
      {everywhere.isSuccess && <SuccessText>{t('settings.loggedOutEverywhere')}</SuccessText>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => everywhere.mutate()} disabled={everywhere.isPending}>
          {t('settings.logoutEverywhere')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          {t('nav.logout')}
        </Button>
      </div>
    </Section>
  )
}

function DeleteAccountSection() {
  const { logout } = useAuthActions()
  const navigate = useNavigate()
  const remove = useMutation({
    mutationFn: accountApi.deleteAccount,
    onSuccess: () => {
      logout()
      navigate('/register')
    },
  })
  return (
    <Section title={t('settings.dangerZone')}>
      <ErrorText error={remove.error} />
      <Button
        variant="danger"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(t('settings.deleteAccountConfirm'))) remove.mutate()
        }}
      >
        {t('settings.deleteAccount')}
      </Button>
    </Section>
  )
}
