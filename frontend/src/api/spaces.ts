import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export type Role = 'OWNER' | 'MEMBER'

export interface Space {
  id: string
  name: string
  myRole: Role
  memberCount: number
  createdAt: string
}

export interface Member {
  userId: string
  displayName: string
  role: Role
  joinedAt: string
}

export interface Invite {
  id: string
  createdAt: string
  expiresAt: string
}

export interface CreatedInvite {
  invite: Invite
  token: string
  url: string
}

export interface InvitePreview {
  spaceName: string
  invitedBy: string
  alreadyMember: boolean
}

export const spacesApi = {
  list: () => api.get<Space[]>('/api/spaces'),
  get: (id: string) => api.get<Space>(`/api/spaces/${id}`),
  create: (name: string) => api.post<Space>('/api/spaces', { name }),
  rename: (id: string, name: string) => api.put<Space>(`/api/spaces/${id}/name`, { name }),
  delete: (id: string) => api.delete(`/api/spaces/${id}`),
  /** The user's own order of their spaces (also used by the start page and the Android app). */
  reorder: (spaceIds: string[]) => api.put<Space[]>('/api/spaces/order', { spaceIds }),
  members: (id: string) => api.get<Member[]>(`/api/spaces/${id}/members`),
  removeMember: (id: string, userId: string) => api.delete(`/api/spaces/${id}/members/${userId}`),
  leave: (id: string) => api.post<void>(`/api/spaces/${id}/leave`),
  transferOwnership: (id: string, userId: string) => api.post<Space>(`/api/spaces/${id}/transfer-ownership`, { userId }),
  invites: (id: string) => api.get<Invite[]>(`/api/spaces/${id}/invites`),
  createInvite: (id: string, expiresInHours: number) =>
    api.post<CreatedInvite>(`/api/spaces/${id}/invites`, { expiresInHours }),
  revokeInvite: (id: string, inviteId: string) => api.delete(`/api/spaces/${id}/invites/${inviteId}`),
  previewInvite: (token: string) => api.get<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) => api.post<Space>(`/api/invites/${encodeURIComponent(token)}/accept`),
}

/** Query keys in one place, so mutations invalidate the right cached data. */
export const spaceKeys = {
  all: ['spaces'] as const,
  detail: (id: string) => ['spaces', id] as const,
  members: (id: string) => ['spaces', id, 'members'] as const,
  invites: (id: string) => ['spaces', id, 'invites'] as const,
}

export function useSpaces() {
  return useQuery({ queryKey: spaceKeys.all, queryFn: spacesApi.list })
}

export function useSpace(id: string) {
  return useQuery({ queryKey: spaceKeys.detail(id), queryFn: () => spacesApi.get(id) })
}
