import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiTokensApi, type CreatedApiToken, type TokenScope } from '../../api/apiTokens'
import { Button, Card, ErrorText, TextField } from '../../components/ui'
import { t, tDynamic } from '../../i18n/messages'

const EXPIRY_OPTIONS: (number | null)[] = [30, 90, 365, null]
const tokensKey = ['apiTokens']

/** Personal API tokens for AI agents: create (shown once), list, revoke. */
export function ApiTokensSection() {
  const queryClient = useQueryClient()
  const tokens = useQuery({ queryKey: tokensKey, queryFn: apiTokensApi.list })
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: tokensKey })
  const revoke = useMutation({ mutationFn: apiTokensApi.revoke, onSuccess: refresh })

  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-semibold">{t('tokens.title')}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('tokens.explanation')}</p>
      <ErrorText error={tokens.error ?? revoke.error} />
      {tokens.data && tokens.data.length > 0 && (
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          {tokens.data.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {token.name} <span className="text-xs text-gray-500">({tDynamic(`tokens.scope.${token.scope}`)})</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {token.expiresAt ? t('tokens.expires', { date: formatDate(token.expiresAt) }) : t('tokens.neverExpires')}
                  {' · '}
                  {token.lastUsedAt ? t('tokens.lastUsed', { date: formatDate(token.lastUsedAt) }) : t('tokens.neverUsed')}
                </p>
              </div>
              <Button variant="ghost" onClick={() => window.confirm(t('tokens.revokeConfirm', { name: token.name })) && revoke.mutate(token.id)}>
                {t('tokens.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {created && <CreatedTokenBox created={created} onDone={() => setCreated(null)} />}
      <NewTokenForm
        onCreated={(result) => {
          setCreated(result)
          refresh()
        }}
      />
    </Card>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function NewTokenForm({ onCreated }: { onCreated: (created: CreatedApiToken) => void }) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('READ')
  const [expiry, setExpiry] = useState<number | null>(90)
  const create = useMutation({
    mutationFn: () => apiTokensApi.create(name.trim(), scope, expiry),
    onSuccess: (result) => {
      setName('')
      onCreated(result)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) create.mutate()
  }

  const selectClass = 'block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900'
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
      <TextField label={t('tokens.name')} placeholder={t('tokens.namePlaceholder')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-medium">{t('tokens.scope')}</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as TokenScope)} className={selectClass}>
            <option value="READ">{t('tokens.scope.READ')}</option>
            <option value="FULL">{t('tokens.scope.FULL')}</option>
          </select>
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-medium">{t('tokens.validFor')}</span>
          <select value={expiry ?? 'never'} onChange={(e) => setExpiry(e.target.value === 'never' ? null : Number(e.target.value))} className={selectClass}>
            {EXPIRY_OPTIONS.map((days) => (
              <option key={days ?? 'never'} value={days ?? 'never'}>
                {days ? t('tokens.days', { days }) : t('tokens.never')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorText error={create.error} />
      <Button type="submit" disabled={!name.trim() || create.isPending}>
        {t('tokens.create')}
      </Button>
    </form>
  )
}

function CreatedTokenBox({ created, onDone }: { created: CreatedApiToken; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2 rounded-lg bg-yellow-50 p-3 dark:bg-yellow-950">
      <p className="text-sm font-medium">{t('tokens.onceHint')}</p>
      <input
        readOnly
        aria-label={t('tokens.rawToken')}
        value={created.rawToken}
        onFocus={(e) => e.target.select()}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs dark:border-gray-600 dark:bg-gray-900"
      />
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(created.rawToken)
            setCopied(true)
          }}
        >
          {copied ? t('invites.copied') : t('tokens.copy')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  )
}
