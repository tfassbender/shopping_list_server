import type { Item } from '../api/lists'

/**
 * Display order of a list without a shop layout: oldest first (order of adding). With the
 * "checked items to the end" setting, checked items follow all open ones (keeping their relative order).
 */
export function sortItems(items: Item[], checkedToEnd: boolean): Item[] {
  const byCreation = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!checkedToEnd) return byCreation
  return [...byCreation.filter((i) => !i.checked), ...byCreation.filter((i) => i.checked)]
}

/** "2 l" / "2" / "l" / "" - quantity and unit as shown in front of the item name. */
export function amountText(item: Pick<Item, 'quantity' | 'unit'>): string {
  return [item.quantity, item.unit].filter(Boolean).join(' ')
}
