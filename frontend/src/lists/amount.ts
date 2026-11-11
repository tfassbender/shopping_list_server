/** "2 l" / "2" / "l" / "" - quantity and unit as one text, shown in front of the item name. */
export function formatAmount(item: { quantity: string | null; unit: string | null }): string {
  return [item.quantity, item.unit].filter(Boolean).join(' ')
}
