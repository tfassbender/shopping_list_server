import type { Item } from '../api/lists'
import { compareInstants, sortItems } from './sortItems'

const item = (id: string, createdAt: string): Item => ({
  id, name: id, quantity: null, unit: null, note: null, categoryId: null, checked: false, createdAt, seq: 1,
})

describe('sortItems (order of adding)', () => {
  it('compares instants with fractions of different length correctly', () => {
    expect(compareInstants('2026-01-01T10:00:00Z', '2026-01-01T10:00:00.001Z')).toBeLessThan(0)
    expect(compareInstants('2026-01-01T10:00:00.5Z', '2026-01-01T10:00:00.50001Z')).toBeLessThan(0)
    expect(compareInstants('2026-01-01T10:00:00.100Z', '2026-01-01T10:00:00.1Z')).toBe(0)
    expect(compareInstants('2026-01-01T10:00:01Z', '2026-01-01T10:00:00.999999Z')).toBeGreaterThan(0)
  })

  it('sorts oldest first and keeps the given order for equal times', () => {
    const items = [item('c', '2026-01-01T10:00:00.002Z'), item('b', '2026-01-01T10:00:00Z'), item('a', '2026-01-01T10:00:00Z'), item('d', '2026-01-01T10:00:00.001Z')]
    expect(sortItems(items).map((i) => i.id)).toEqual(['b', 'a', 'd', 'c'])
  })
})
