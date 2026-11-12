/**
 * "2 l" / "2" / "" - quantity and unit as one text, shown in front of the item name. A unit without an
 * amount is not shown ("l Oat milk" reads oddly); it stays saved and reappears with an amount.
 */
export function formatAmount(item: { quantity: string | null; unit: string | null }): string {
  if (!item.quantity) return ''
  return [item.quantity, item.unit].filter(Boolean).join(' ')
}

/** A valid amount: empty, or digits with at most one decimal separator ("2", "0,5", "1.25", "1."). */
export function isValidAmount(quantity: string): boolean {
  return /^\d*(?:[.,]\d*)?$/.test(quantity.trim())
}
