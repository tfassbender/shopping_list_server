import { t } from './messages'

describe('t', () => {
  it('replaces placeholders', () => {
    expect(t('health.online', { version: '1.0' })).toBe('Connected to server (version 1.0)')
  })

  it('keeps unknown placeholders', () => {
    expect(t('health.online')).toBe('Connected to server (version {version})')
  })
})
