import { describe, expect, it } from 'vitest'
import { rankSuggestions, type HistoryEntry } from './catalog'

const t0 = '2026-01-01T10:00:00Z'
const entry = (name: string, usageCount: number, lastUsed = t0): HistoryEntry => ({ name, categoryId: null, unit: null, usageCount, lastUsed })

// Same cases as the server's SpaceCatalogTest.Suggestions - keep both in sync.
const history = [
  entry('Milk', 2),
  entry('Mineral water', 3),
  entry('Mint', 0, '2026-01-01T10:00:10Z'),
  entry('Oat milk', 4),
  entry('Bread', 1),
]
const names = (query: string, limit = 10, from = history) => rankSuggestions(from, query, limit).map((s) => s.name)

describe('rankSuggestions', () => {
  it('ranks name prefix matches before word matches, then by usage', () => {
    expect(names('mi')).toEqual(['Mineral water', 'Milk', 'Mint', 'Oat milk'])
  })

  it('matches case-insensitively and respects the limit', () => {
    expect(names('MI', 2)).toEqual(['Mineral water', 'Milk'])
    expect(names('milk')).toEqual(['Milk', 'Oat milk'])
  })

  it('breaks ties in usage by recency, also with differing fraction digits', () => {
    const tied = [entry('Apple', 0, '2026-01-01T10:00:00.900Z'), entry('Apricot', 0, '2026-01-01T10:00:01Z')]
    expect(names('ap', 5, tied)).toEqual(['Apricot', 'Apple'])
  })

  it('normalizes whitespace in names and query', () => {
    expect(names('  oat   M ')).toEqual(['Oat milk'])
  })

  it('gives nothing for a blank query or no matches', () => {
    expect(names('  ')).toEqual([])
    expect(names('xyz')).toEqual([])
  })
})
