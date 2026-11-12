import { de } from './de'
import { en, type MessageKey } from './en'
import { errorMessage, getLanguage, setLanguage, t } from './messages'

describe('t', () => {
  afterEach(() => setLanguage('en'))

  it('replaces placeholders', () => {
    expect(t('health.online', { version: '1.0' })).toBe('Connected to server (version 1.0)')
  })

  it('keeps unknown placeholders', () => {
    expect(t('health.online')).toBe('Connected to server (version {version})')
  })

  it('switches the language and remembers it on the device', () => {
    setLanguage('de')
    expect(getLanguage()).toBe('de')
    expect(t('addItem.title')).toBe('Artikel hinzufügen')
    expect(errorMessage('INVALID_CREDENTIALS')).toBe('E-Mail oder Passwort falsch.')
    expect(errorMessage('SOMETHING_NEW')).toBe('Etwas ist schiefgelaufen. Bitte versuch es noch einmal.')
    expect(localStorage.getItem('shoppinglist.language')).toBe('de')
    expect(document.documentElement.lang).toBe('de')
  })
})

describe('German translations', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)}/g)].map((m) => m[1]).sort()

  it('use exactly the placeholders of the English texts', () => {
    const mismatches = (Object.keys(en) as MessageKey[]).filter(
      (key) => JSON.stringify(placeholders(en[key])) !== JSON.stringify(placeholders(de[key])),
    )
    expect(mismatches).toEqual([])
  })

  it('are not empty and not just copied English (except names and the language list)', () => {
    const identical = (Object.keys(en) as MessageKey[]).filter((key) => de[key] === en[key])
    expect(identical.every((key) => key.startsWith('settings.language.') || ['common.name', 'item.name', 'tokens.name', 'offline.badge', 'item.noUnit', 'spaces.summary'].includes(key))).toBe(true)
    expect((Object.keys(de) as MessageKey[]).every((key) => de[key].trim().length > 0)).toBe(true)
  })
})
