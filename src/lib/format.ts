/** German formatting helpers. */

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const km = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

export function formatCents(cents: number): string {
  return euro.format(cents / 100)
}

export function formatKm(value: number): string {
  return `${km.format(value)} km`
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)} %`
}

/** Parse a German amount ("12,34" or "12.34") into integer cents. */
export function parseAmountToCents(input: string): number | null {
  const normalised = input.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalised)) return null
  return Math.round(Number(normalised) * 100)
}
