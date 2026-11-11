import type { Category } from '../api/catalog'
import type { Item } from '../api/lists'

/**
 * Default order of a list without a shop layout: oldest first (order of adding). With the
 * "checked items to the end" setting, checked items follow all open ones (keeping their relative order).
 */
export function sortItems(items: Item[], checkedToEnd: boolean): Item[] {
  const byCreation = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!checkedToEnd) return byCreation
  return [...byCreation.filter((i) => !i.checked), ...byCreation.filter((i) => i.checked)]
}

/** A visible block of the list: one category (colored header), uncategorized items, or the checked items. */
export interface ItemSection {
  key: string
  kind: 'category' | 'other' | 'checked' | 'items'
  category?: Category
  items: Item[]
}

/**
 * Groups already ordered items by category in the given category order; items without a (known)
 * category come after the categories. With `checkedToEnd`, all checked items form a last section.
 * The order of items inside a section is kept.
 */
export function groupItems(orderedItems: Item[], categories: Category[], checkedToEnd: boolean): ItemSection[] {
  const known = new Set(categories.map((c) => c.id))
  const grouped = checkedToEnd ? orderedItems.filter((i) => !i.checked) : orderedItems
  const sections: ItemSection[] = categories
    .map((category) => ({ key: category.id, kind: 'category' as const, category, items: grouped.filter((i) => i.categoryId === category.id) }))
    .filter((s) => s.items.length > 0)
  const other = grouped.filter((i) => !i.categoryId || !known.has(i.categoryId))
  if (other.length > 0) sections.push({ key: '__other', kind: 'other', items: other })
  const checked = checkedToEnd ? orderedItems.filter((i) => i.checked) : []
  if (checked.length > 0) sections.push({ key: '__checked', kind: 'checked', items: checked })
  return sections
}

/**
 * Sections for a list the server already sorted for a shop. The server order is kept:
 * - mode CATEGORIES: a new section starts whenever the category changes (so headers follow the shop),
 * - mode ITEMS: one section without header (items carry their category color).
 * With `checkedToEnd`, checked items always form the last section (also right after a local check,
 * before the server's re-sorted answer arrives).
 */
export function groupSorted(sortedItems: Item[], categories: Category[], mode: 'CATEGORIES' | 'ITEMS', checkedToEnd: boolean): ItemSection[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const open = checkedToEnd ? sortedItems.filter((i) => !i.checked) : sortedItems
  const sections: ItemSection[] = []
  if (mode === 'ITEMS') {
    if (open.length > 0) sections.push({ key: '__items', kind: 'items', items: open })
  } else {
    for (const item of open) {
      const category = item.categoryId ? byId.get(item.categoryId) : undefined
      const key = category?.id ?? '__other'
      const last = sections.at(-1)
      if (last && last.key.split('#')[0] === key) last.items.push(item)
      else sections.push({ key: `${key}#${sections.length}`, kind: category ? 'category' : 'other', category, items: [item] })
    }
  }
  const checked = checkedToEnd ? sortedItems.filter((i) => i.checked) : []
  if (checked.length > 0) sections.push({ key: '__checked', kind: 'checked', items: checked })
  return sections
}

/** "2 l" / "2" / "l" / "" - quantity and unit as shown in front of the item name. */
export function amountText(item: Pick<Item, 'quantity' | 'unit'>): string {
  return [item.quantity, item.unit].filter(Boolean).join(' ')
}
