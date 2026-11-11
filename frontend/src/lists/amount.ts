/**
 * One "Amount" field instead of two: "500 g" is stored as quantity "500" and unit "g", "2" as quantity
 * only, "Packung" (no number) as unit only. The server keeps both fields, so sorting, the item history
 * and other clients are unaffected.
 */
export function parseAmount(text: string): { quantity: string | null; unit: string | null } {
  const trimmed = text.trim()
  if (!trimmed) return { quantity: null, unit: null }
  const match = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(trimmed)
  if (!match) return { quantity: null, unit: trimmed }
  return { quantity: match[1], unit: match[2].trim() || null }
}

/** "2 l" / "2" / "l" / "" - quantity and unit as one text, the inverse of [parseAmount]. */
export function formatAmount(item: { quantity: string | null; unit: string | null }): string {
  return [item.quantity, item.unit].filter(Boolean).join(' ')
}
