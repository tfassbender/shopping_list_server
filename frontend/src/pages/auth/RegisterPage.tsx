import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { authApi, type Language } from '../../api/auth'
import { safeRedirect } from '../../auth/RequireAuth'
import { useAuthActions, useSession } from '../../auth/useAuth'
import { Page } from '../../components/AppBar'
import { Button, ErrorText, SuccessText, TextField } from '../../components/ui'
import { getLanguage, t } from '../../i18n/messages'

const MIN_PASSWORD_LENGTH = 8

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const redirect = safeRedirect(searchParams.get('redirect'))
  const session = useSession()
  const navigate = useNavigate()
  const { startSession } = useAuthActions()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const register = useMutation({
    mutationFn: () => authApi.register({ email, displayName, password, language: getLanguage() satisfies Language }),
    onSuccess: (response) => {
      if (response.token) {
        startSession(response)
        navigate(redirect, { replace: true })
      }
    },
  })

  if (session) return <Navigate to={redirect} replace />

  if (register.data?.verificationRequired) {
    return (
      <Page title={t('auth.register.title')}>
      <div className="mx-auto max-w-sm space-y-4 py-6">
        <SuccessText>{t('auth.register.checkMail', { email })}</SuccessText>
      </div>
    </Page>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    register.mutate()
  }

  return (
    <Page title={t('auth.register.title')}>
      <div className="mx-auto max-w-sm space-y-4 py-6">
      <form onSubmit={submit} className="space-y-4">
        <TextField label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <TextField
            label={t('auth.displayName')}
            autoComplete="nickname"
            required
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">{t('auth.displayNameHint')}</p>
        </div>
        <div>
          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">{t('auth.passwordHint', { min: MIN_PASSWORD_LENGTH })}</p>
        </div>
        <ErrorText error={register.error} />
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {t('auth.register.submit')}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm">
        <Link to={`/login?redirect=${encodeURIComponent(redirect)}`} className="text-accent underline">
          {t('auth.register.haveAccount')}
        </Link>
      </div>
    </div>
    </Page>
  )
}
