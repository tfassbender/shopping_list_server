import { api } from './client'

export type TokenScope = 'READ' | 'FULL'

export interface ApiToken {
  id: string
  name: string
  scope: TokenScope
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export interface CreatedApiToken {
  token: ApiToken
  /** Shown only once - the server keeps just a hash. */
  rawToken: string
}

export const apiTokensApi = {
  list: () => api.get<ApiToken[]>('/api/users/me/api-tokens'),
  create: (name: string, scope: TokenScope, expiresInDays: number | null) =>
    api.post<CreatedApiToken>('/api/users/me/api-tokens', { name, scope, expiresInDays }),
  revoke: (id: string) => api.delete(`/api/users/me/api-tokens/${id}`),
}
