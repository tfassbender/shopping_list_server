import type { ItemOrder } from '../api/auth'
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
const sorted = (items: Item[], l: ShopLayout, opts: { checkedToEnd?: boolean; itemOrder?: ItemOrder } = {}) =>
  sortForLayout(items, l, categories, opts.checkedToEnd ?? false, opts.itemOrder).map((i) => i.name)

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
    const unknown = [item('Zucchini'), item('Avocado'), item('Bread')]
    expect(sorted(unknown, layout({ mode: 'ITEMS', itemOrder: ['Bread'] }))).toEqual(['Bread', 'Zucchini', 'Avocado'])
    expect(sorted(unknown, layout({ mode: 'ITEMS', itemOrder: ['Bread'] }), { itemOrder: 'ALPHABETICAL' })).toEqual(['Bread', 'Avocado', 'Zucchini'])
  })

  it('order of adding within the same position by default, alphabetically if wanted', () => {
    const items = [item('Quark', 'dairy'), item('Butter', 'dairy'), item('Ayran', 'dairy')]
    expect(sorted([...items].reverse(), layout({ categoryOrder: ['dairy'] }))).toEqual(['Quark', 'Butter', 'Ayran'])
    expect(sorted([item('banana'), item('Apple'), item('cherry')], layout(), { itemOrder: 'ALPHABETICAL' })).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('checking an item never moves it (issue #8)', () => {
    const items = [item('Cheese', 'dairy'), item('Butter', 'dairy')]
    const checked = [items[0], { ...items[1], checked: true }]
    expect(sorted(checked, layout({ categoryOrder: ['dairy'] }))).toEqual(sorted(items, layout({ categoryOrder: ['dairy'] })))
  })

  it('checked items to the end when wanted', () => {
    const items = [item('Bread', 'bakery', true), item('Milk', 'dairy'), item('Carrots', 'veg', true), item('Cheese', 'dairy')]
    const l = layout({ categoryOrder: ['bakery', 'dairy', 'veg'] })
    expect(sorted(items, l, { checkedToEnd: true })).toEqual(['Milk', 'Cheese', 'Bread', 'Carrots'])
    expect(sorted(items, l, { checkedToEnd: false })).toEqual(['Bread', 'Milk', 'Cheese', 'Carrots'])
  })

  it('normalizes names like the server', () => {
    expect(normalizeName('  Whole   MILK ')).toBe('whole milk')
  })
})
