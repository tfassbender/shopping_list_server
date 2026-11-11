import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { useAuthActions } from '../../auth/useAuth'
import { Button, ErrorText, Loading, PageTitle, SuccessText, TextField } from '../../components/ui'
import { t } from '../../i18n/messages'

/** Target of the link in the verification email: confirms the address and logs the user in. */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { startSession } = useAuthActions()
  const [email, setEmail] = useState('')
  const verify = useMutation({
    mutationFn: () => authApi.verifyEmail(token),
    onSuccess: (response) => {
      startSession(response)
      navigate('/', { replace: true })
    },
  })
  const resend = useMutation({ mutationFn: () => authApi.resendVerification(email) })

  // React StrictMode runs effects twice in dev; the ref makes sure the single-use token is sent once.
  const started = useRef(false)
  useEffect(() => {
    if (!started.current && token) {
      started.current = true
      verify.mutate()
    }
  }, [token, verify])

  function submitResend(event: FormEvent) {
    event.preventDefault()
    resend.mutate()
  }

  return (
    <section className="mx-auto max-w-sm space-y-4">
      <PageTitle>{t('auth.verify.title')}</PageTitle>
      {verify.isPending && <Loading />}
      <ErrorText error={verify.error} />
      {(verify.isError || !token) && (
        <form onSubmit={submitResend} className="space-y-4">
          <TextField label={t('auth.email')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorText error={resend.error} />
          {resend.isSuccess && <SuccessText>{t('auth.verify.resent')}</SuccessText>}
          <Button type="submit" variant="secondary" className="w-full" disabled={resend.isPending}>
            {t('auth.verify.resend')}
          </Button>
        </form>
      )}
    </section>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const forgot = useMutation({ mutationFn: () => authApi.forgotPassword(email) })

  function submit(event: FormEvent) {
    event.preventDefault()
    forgot.mutate()
  }

  return (
    <section className="mx-auto max-w-sm">
      <PageTitle>{t('auth.forgot.title')}</PageTitle>
      {forgot.isSuccess ? (
        <SuccessText>{t('auth.forgot.sent')}</SuccessText>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <TextField label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorText error={forgot.error} />
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </section>
  )
}

/** Target of the link in the password reset email. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { startSession } = useAuthActions()
  const [password, setPassword] = useState('')
  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: (response) => {
      startSession(response)
      navigate('/', { replace: true })
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    reset.mutate()
  }

  return (
    <section className="mx-auto max-w-sm">
      <PageTitle>{t('auth.reset.title')}</PageTitle>
      <form onSubmit={submit} className="space-y-4">
        <TextField
          label={t('auth.newPassword')}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText error={reset.error} />
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </section>
  )
}
