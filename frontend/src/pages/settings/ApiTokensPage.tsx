import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiTokensApi, type ApiToken, type CreatedApiToken, type TokenScope } from '../../api/apiTokens'
import { Page } from '../../components/AppBar'
import { ConfirmDialog, Dialog, DialogActions } from '../../components/Dialog'
import { Button, ErrorText, Fab, Hint, Loading, Row, Segmented, TextField } from '../../components/ui'
import { t } from '../../i18n/messages'
import { OnlineOnly, useOnline } from '../../offline/online'

const tokensKey = ['apiTokens']

/** Personal API tokens for AI agents: list with "Revoke"; + creates one, shown once with "Copy". */
export function ApiTokensPage() {
  const queryClient = useQueryClient()
  const online = useOnline()
  const tokens = useQuery({ queryKey: tokensKey, queryFn: apiTokensApi.list })
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiToken | null>(null)
  const revoke = useMutation({
    mutationFn: apiTokensApi.revoke,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tokensKey }),
  })

  return (
    <Page title={t('tokens.title')} back="/settings">
      <OnlineOnly>
        <Hint>{t('tokens.explanation')}</Hint>
        <ErrorText error={tokens.error ?? revoke.error} />
        {tokens.isPending && <Loading />}
        {tokens.data?.length === 0 && <p className="py-6 text-center text-muted">{t('tokens.empty')}</p>}
        {tokens.data?.map((token) => (
          <Row
            key={token.id}
            title={token.name}
            hint={`${t(token.scope === 'READ' ? 'tokens.scope.READ' : 'tokens.scope.FULL')} · ${expiry(token)} · ${lastUse(token)}`}
            end={
              <Button variant="secondary" onClick={() => setRevoking(token)}>
                {t('tokens.revoke')}
              </Button>
            }
          />
        ))}
      </OnlineOnly>
      <Fab label={t('tokens.create')} onClick={() => setCreating(true)} disabled={!online} />
      {creating && (
        <NewTokenDialog
          onCreated={() => void queryClient.invalidateQueries({ queryKey: tokensKey })}
          onClose={() => setCreating(false)}
        />
      )}
      {revoking && (
        <ConfirmDialog
          title={t('tokens.revokeTitle', { name: revoking.name })}
          text={t('tokens.revokeConfirm')}
          confirmLabel={t('tokens.revoke')}
          onConfirm={() => revoke.mutate(revoking.id)}
          onClose={() => setRevoking(null)}
        />
      )}
    </Page>
  )
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString()
const expiry = (token: ApiToken) => (token.expiresAt ? t('tokens.expires', { date: formatDate(token.expiresAt) }) : t('tokens.neverExpires'))
const lastUse = (token: ApiToken) => (token.lastUsedAt ? t('tokens.lastUsed', { date: formatDate(token.lastUsedAt) }) : t('tokens.neverUsed'))

const VALIDITY = ['30', '365', 'never'] as const

/** Name, access and validity; afterwards the raw token, which the server never shows again. */
function NewTokenDialog({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('READ')
  const [validity, setValidity] = useState<(typeof VALIDITY)[number]>('30')
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () => apiTokensApi.create(name.trim(), scope, validity === 'never' ? null : Number(validity)),
    onSuccess: (result) => {
      setCreated(result)
      onCreated()
    },
  })

  if (created) {
    return (
      <Dialog title={t('tokens.copyTitle')} onClose={onClose}>
        <input
          readOnly
          aria-label={t('tokens.rawToken')}
          value={created.rawToken}
          onFocus={(e) => e.target.select()}
          className="block w-full rounded-lg border border-line bg-raised px-3 py-3 font-mono text-sm"
        />
        <p className="text-muted">{t('tokens.onceHint')}</p>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
          <Button
            onClick={() =>
              void navigator.clipboard
                .writeText(created.rawToken)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            {copied ? t('invites.copied') : t('tokens.copy')}
          </Button>
        </DialogActions>
      </Dialog>
    )
  }
  return (
    <Dialog title={t('tokens.create')} onClose={onClose} onSubmit={() => name.trim() && create.mutate()}>
      <TextField label={t('tokens.name')} required autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="space-y-2">
        <span className="block text-sm text-muted">{t('tokens.scope')}</span>
        <Segmented
          label={t('tokens.scope')}
          options={[
            { value: 'READ', label: t('tokens.scope.READ') },
            { value: 'FULL', label: t('tokens.scope.FULL') },
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>
      <div className="space-y-2">
        <span className="block text-sm text-muted">{t('tokens.validFor')}</span>
        <Segmented
          label={t('tokens.validFor')}
          options={[
            { value: '30', label: t('tokens.days', { days: 30 }) },
            { value: '365', label: t('tokens.oneYear') },
            { value: 'never', label: t('tokens.never') },
          ]}
          value={validity}
          onChange={setValidity}
        />
      </div>
      <ErrorText error={create.error} />
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
