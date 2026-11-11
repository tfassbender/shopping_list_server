import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { safeRedirect } from '../../auth/RequireAuth'
import { useAuthActions, useSession } from '../../auth/useAuth'
import { Button, ErrorText, PageTitle, TextField } from '../../components/ui'
import { t } from '../../i18n/messages'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const redirect = safeRedirect(searchParams.get('redirect'))
  const session = useSession()
  const navigate = useNavigate()
  const { startSession } = useAuthActions()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => authApi.login(email, password),
    onSuccess: (response) => {
      startSession(response)
      navigate(redirect, { replace: true })
    },
  })

  if (session) return <Navigate to={redirect} replace />

  function submit(event: FormEvent) {
    // Prevent the browser's default full-page form submission; React handles it.
    event.preventDefault()
    login.mutate()
  }

  const registerLink = `/register${redirect !== '/' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`
  return (
    <section className="mx-auto max-w-sm">
      <PageTitle>{t('auth.login.title')}</PageTitle>
      <form onSubmit={submit} className="space-y-4">
        <TextField label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText error={login.error} />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <div className="mt-6 flex flex-col gap-3 text-center text-sm">
        <Link to={registerLink} className="text-green-700 underline dark:text-green-400">
          {t('auth.login.noAccount')}
        </Link>
        <Link to="/forgot-password" className="text-gray-600 underline dark:text-gray-400">
          {t('auth.login.forgot')}
        </Link>
      </div>
    </section>
  )
}
