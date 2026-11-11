import { api } from './client'
import type { ThemePreference } from '../theme/theme'

export type Language = 'en' | 'de'

export interface UserSettings {
  language: Language
  theme: 'SYSTEM' | 'LIGHT' | 'DARK'
  checkedItemsToEnd: boolean
  ignoreMergeWarnings: boolean
}

export interface User {
  id: string
  email: string
  displayName: string
  emailVerified: boolean
  settings: UserSettings
}

export interface SessionResponse {
  user: User
  /** null while the email still needs to be verified. */
  token: string | null
  expiresAt: string | null
  verificationRequired: boolean
}

export interface AuthConfig {
  emailEnabled: boolean
  minPasswordLength: number
}

export const authApi = {
  config: () => api.get<AuthConfig>('/api/auth/config'),
  register: (body: { email: string; displayName: string; password: string; language: Language }) =>
    api.post<SessionResponse>('/api/auth/register', body),
  login: (email: string, password: string) => api.post<SessionResponse>('/api/auth/login', { email, password }),
  refresh: () => api.post<SessionResponse>('/api/auth/refresh'),
  verifyEmail: (token: string) => api.post<SessionResponse>('/api/auth/verify-email', { token }),
  resendVerification: (email: string) => api.post<void>('/api/auth/resend-verification', { email }),
  forgotPassword: (email: string) => api.post<void>('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post<SessionResponse>('/api/auth/reset-password', { token, password }),
}

export const accountApi = {
  me: () => api.get<User>('/api/users/me'),
  updateSettings: (settings: UserSettings) => api.put<User>('/api/users/me/settings', settings),
  updateDisplayName: (displayName: string) => api.put<User>('/api/users/me/display-name', { displayName }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<SessionResponse>('/api/users/me/change-password', { currentPassword, newPassword }),
  logoutEverywhere: () => api.post<SessionResponse>('/api/users/me/logout-everywhere'),
  deleteAccount: () => api.delete('/api/users/me'),
}

export function toThemePreference(theme: UserSettings['theme']): ThemePreference {
  return theme.toLowerCase() as ThemePreference
}
