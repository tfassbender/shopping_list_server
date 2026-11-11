/**
 * Theme handling: 'system' follows the OS setting (default), 'light'/'dark' force a theme.
 * The preference will be stored in the user settings (Phase 1); for now the default is used.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

const darkQuery = '(prefers-color-scheme: dark)'

export function isDark(preference: ThemePreference, systemPrefersDark: boolean): boolean {
  return preference === 'dark' || (preference === 'system' && systemPrefersDark)
}

/**
 * Applies the theme by toggling the `dark` class on <html> (see index.css). For 'system' it also follows
 * live OS changes. Returns a cleanup function that stops listening.
 */
export function applyTheme(preference: ThemePreference): () => void {
  const media = window.matchMedia(darkQuery)
  const update = () => document.documentElement.classList.toggle('dark', isDark(preference, media.matches))
  update()
  if (preference !== 'system') {
    return () => {}
  }
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
