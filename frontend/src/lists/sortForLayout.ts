import type { ItemOrder } from '../api/auth'
import type { Category } from '../api/catalog'
import type { ShopLayout } from '../api/layouts'
import type { Item } from '../api/lists'
import { compareInstants } from './sortItems'

/** Same normalization as the server (`SpaceCatalog.normalize`): trimmed, lowercase, single spaces. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Client-side copy of the server's `ItemSorter` (so sorting works offline). Keys, most important first:
 * 1. checked items to the end (if the user wants that),
 * 2. position in the layout (category order in mode CATEGORIES – then the remaining categories in the
 *    space order, then uncategorized, then the categories the shop doesn't have; item names in mode
 *    ITEMS – unknown items last),
 * 3. the user's item order: order of adding (creation time, then name) or alphabetical (name, then
 *    creation time). Nothing that changes when an item is checked, so checking never moves an item.
 * The test cases mirror the server's `ItemSorterTest`; keep both in sync.
 */
export function sortForLayout(
  items: Item[],
  layout: ShopLayout,
  categories: Category[],
  checkedToEnd: boolean,
  itemOrder: ItemOrder = 'ADDED',
): Item[] {
  const position = positionFunction(layout, categories)
  const keyed = items.map((item) => ({
    item,
    checked: checkedToEnd && item.checked ? 1 : 0,
    position: position(item),
    name: item.name.toLowerCase(),
  }))
  type Keyed = (typeof keyed)[number]
  const byName = (a: Keyed, b: Keyed) => compareText(a.name, b.name)
  const byAdding = (a: Keyed, b: Keyed) => compareInstants(a.item.createdAt, b.item.createdAt)
  keyed.sort(
    (a, b) =>
      a.checked - b.checked ||
      a.position - b.position ||
      (itemOrder === 'ALPHABETICAL' ? byName(a, b) || byAdding(a, b) : byAdding(a, b) || byName(a, b)),
  )
  return keyed.map((k) => k.item)
}

/** Plain code point order like Kotlin's String.compareTo (not locale aware) so both sides agree. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function positionFunction(layout: ShopLayout, categories: Category[]): (item: Item) => number {
  if (layout.mode === 'ITEMS') {
    const index = new Map(layout.itemOrder.map((name, i) => [normalizeName(name), i]))
    return (item) => index.get(normalizeName(item.name)) ?? index.size
  }
  const existing = categories.map((c) => c.id)
  const order = [...layout.categoryOrder.filter((id) => existing.includes(id)), ...existing.filter((id) => !layout.categoryOrder.includes(id))]
  const disabled = new Set(layout.disabledCategories ?? [])
  const enabled = order.filter((id) => !disabled.has(id))
  const unknown = enabled.length
  // disabled categories come after the uncategorized items (position `unknown`)
  const index = new Map([...enabled.map((id, i) => [id, i] as const), ...order.filter((id) => disabled.has(id)).map((id, i) => [id, unknown + 1 + i] as const)])
  return (item) => (item.categoryId ? index.get(item.categoryId) : undefined) ?? unknown
}
