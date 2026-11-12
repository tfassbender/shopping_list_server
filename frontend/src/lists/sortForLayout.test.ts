import type { ShopLayout } from '../api/layouts'
import type { Item } from '../api/lists'
import { normalizeName, sortForLayout } from './sortForLayout'

/** Mirrors the server's ItemSorterTest - both sides must sort identically. */
const categories = [
  { id: 'veg', name: 'Vegetables', color: '#0f0' },
  { id: 'dairy', name: 'Dairy', color: '#00f' },
  { id: 'bakery', name: 'Bakery', color: '#a80' },
]
let created = 0
const item = (name: string, categoryId: string | null = null, checked = false): Item => ({
  id: name, name, categoryId, checked, quantity: null, unit: null, note: null, seq: 1,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, created++)).toISOString(),
})
const layout = (overrides: Partial<ShopLayout> = {}): ShopLayout => ({
  id: 'shop', name: 'Shop', mode: 'CATEGORIES', categoryOrder: [], itemOrder: [], listIds: [], createdAt: '', ...overrides,
})
const sorted = (items: Item[], l: ShopLayout, opts: { usage?: Record<string, number>; checkedToEnd?: boolean } = {}) =>
  sortForLayout(items, l, categories, opts.usage ?? {}, opts.checkedToEnd ?? false).map((i) => i.name)

describe('sortForLayout', () => {
  it('follows the category order of the layout', () => {
    expect(sorted([item('Milk', 'dairy'), item('Bread', 'bakery'), item('Carrots', 'veg')], layout({ categoryOrder: ['bakery', 'dairy', 'veg'] })))
      .toEqual(['Bread', 'Milk', 'Carrots'])
  })

  it('missing categories follow in space order, uncategorized last', () => {
    expect(sorted([item('Batteries'), item('Milk', 'dairy'), item('Bread', 'bakery'), item('Carrots', 'veg')], layout({ categoryOrder: ['bakery'] })))
      .toEqual(['Bread', 'Carrots', 'Milk', 'Batteries'])
  })

  it('ignores deleted categories', () => {
    expect(sorted([item('Ghost', 'deleted'), item('Milk', 'dairy')], layout({ categoryOrder: ['deleted', 'dairy'] }))).toEqual(['Milk', 'Ghost'])
  })

  it('item mode: names case-insensitive, unknown items last', () => {
    expect(sorted([item('milk'), item('Bread'), item('Apples')], layout({ mode: 'ITEMS', itemOrder: ['BREAD', 'Apples', 'Milk'] })))
      .toEqual(['Bread', 'Apples', 'milk'])
    expect(sorted([item('Zucchini'), item('Avocado'), item('Bread')], layout({ mode: 'ITEMS', itemOrder: ['Bread'] })))
      .toEqual(['Bread', 'Avocado', 'Zucchini'])
  })

  it('most bought first within the same position, then name', () => {
    const items = [item('Cheese', 'dairy'), item('Butter', 'dairy'), item('Ayran', 'dairy'), item('Quark', 'dairy')]
    expect(sorted(items, layout({ categoryOrder: ['dairy'] }), { usage: { cheese: 1, butter: 2 } }))
      .toEqual(['Butter', 'Cheese', 'Ayran', 'Quark'])
    expect(sorted([item('banana'), item('Apple'), item('cherry')], layout())).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('checked items to the end when wanted', () => {
    const items = [item('Bread', 'bakery', true), item('Milk', 'dairy'), item('Carrots', 'veg', true), item('Cheese', 'dairy')]
    const l = layout({ categoryOrder: ['bakery', 'dairy', 'veg'] })
    expect(sorted(items, l, { checkedToEnd: true })).toEqual(['Cheese', 'Milk', 'Bread', 'Carrots'])
    expect(sorted(items, l, { checkedToEnd: false })).toEqual(['Bread', 'Cheese', 'Milk', 'Carrots'])
  })

  it('normalizes names like the server', () => {
    expect(normalizeName('  Whole   MILK ')).toBe('whole milk')
  })
})
