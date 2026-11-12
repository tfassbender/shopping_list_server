import type { Category } from '../api/catalog'
import type { Item } from '../api/lists'
import { formatAmount } from './amount'

/**
 * Order of a list without a shop layout: oldest first (order of adding). Equal times keep the given order
 * (the sort is stable); the server gives the items of one sync batch distinct times.
 */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => compareInstants(a.createdAt, b.createdAt))
}

/**
 * Compares ISO instants from the server. Plain string comparison is wrong for them: the fraction has a
 * varying length ("10:00:00Z", "10:00:00.5Z", "10:00:00.123456Z") and "Z" sorts after the digits.
 */
export function compareInstants(a: string, b: string): number {
  const x = normalizeInstant(a)
  const y = normalizeInstant(b)
  return x < y ? -1 : x > y ? 1 : 0
}

function normalizeInstant(instant: string): string {
  return instant.replace(/(:\d\d)(?:\.(\d+))?Z$/, (_, seconds: string, fraction: string | undefined) => `${seconds}.${(fraction ?? '').padEnd(9, '0')}Z`)
}

/** A visible block of the list: one category (colored header), uncategorized items, or the checked items. */
export interface ItemSection {
  key: string
  kind: 'category' | 'other' | 'checked' | 'items'
  category?: Category
  items: Item[]
}

/**
 * Checked items stay where they are. Only the sort button moves the items checked at that moment to a
 * last "Checked" section - [movedToEnd] holds their ids. An item that is unchecked again returns to its
 * place (the caller removes it from the set; here only items that are still checked are moved).
 */
function splitMoved(ordered: Item[], movedToEnd: ReadonlySet<string>) {
  const moved = (i: Item) => i.checked && movedToEnd.has(i.id)
  return { inPlace: ordered.filter((i) => !moved(i)), atEnd: ordered.filter(moved) }
}

function withCheckedSection(sections: ItemSection[], atEnd: Item[]): ItemSection[] {
  return atEnd.length > 0 ? [...sections, { key: '__checked', kind: 'checked', items: atEnd }] : sections
}

/**
 * Sections for a list sorted for a shop (see sortForLayout). The given order is kept:
 * - mode CATEGORIES: a new section starts whenever the category changes (so headers follow the shop),
 * - mode ITEMS: one section without header (items carry their category color).
 */
export function groupSorted(
  sortedItems: Item[],
  categories: Category[],
  mode: 'CATEGORIES' | 'ITEMS',
  movedToEnd: ReadonlySet<string> = new Set(),
): ItemSection[] {
  const { inPlace, atEnd } = splitMoved(sortedItems, movedToEnd)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const sections: ItemSection[] = []
  if (mode === 'ITEMS') {
    if (inPlace.length > 0) sections.push({ key: '__items', kind: 'items', items: inPlace })
  } else {
    for (const item of inPlace) {
      const category = item.categoryId ? byId.get(item.categoryId) : undefined
      const key = category?.id ?? '__other'
      const last = sections.at(-1)
      if (last && last.key.split('#')[0] === key) last.items.push(item)
      else sections.push({ key: `${key}#${sections.length}`, kind: category ? 'category' : 'other', category, items: [item] })
    }
  }
  return withCheckedSection(sections, atEnd)
}

/**
 * The same items in the same order, but without category headers: all sections become one header-less
 * section. Only the "Checked" section (moved there by the sort button) stays separate.
 */
export function withoutCategoryHeaders(sections: ItemSection[]): ItemSection[] {
  const items = sections.filter((s) => s.kind !== 'checked').flatMap((s) => s.items)
  const checked = sections.filter((s) => s.kind === 'checked')
  return [...(items.length > 0 ? [{ key: '__items', kind: 'items' as const, items }] : []), ...checked]
}

/** "2 l" / "2" / "l" / "" - quantity and unit as shown in front of the item name. */
export function amountText(item: Pick<Item, 'quantity' | 'unit'>): string {
  return formatAmount(item)
}
