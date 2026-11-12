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
 *    space order, uncategorized last; item names in mode ITEMS – unknown items last),
 * 3. personal favorites, 4. most bought, 5. name, 6. creation time.
 * The test cases mirror the server's `ItemSorterTest`; keep both in sync.
 */
export function sortForLayout(
  items: Item[],
  layout: ShopLayout,
  categories: Category[],
  favorites: Set<string>,
  usage: Record<string, number>,
  checkedToEnd: boolean,
): Item[] {
  const position = positionFunction(layout, categories)
  const keyed = items.map((item) => ({
    item,
    checked: checkedToEnd && item.checked ? 1 : 0,
    position: position(item),
    favorite: favorites.has(normalizeName(item.name)) ? 0 : 1,
    usage: usage[normalizeName(item.name)] ?? 0,
    name: item.name.toLowerCase(),
  }))
  keyed.sort(
    (a, b) =>
      a.checked - b.checked ||
      a.position - b.position ||
      a.favorite - b.favorite ||
      b.usage - a.usage ||
      compareText(a.name, b.name) ||
      compareInstants(a.item.createdAt, b.item.createdAt),
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
  const index = new Map(order.map((id, i) => [id, i]))
  return (item) => (item.categoryId ? index.get(item.categoryId) : undefined) ?? order.length
}
