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

/** Length of a reservation, e.g. "8 Std." or "2 Tage 4 Std.". */
export function formatDuration(startsAt: string, endsAt: string): string {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)
  if (minutes <= 0) return '–'

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`)
  if (hours > 0) parts.push(`${hours} Std.`)
  if (rest > 0 && days === 0) parts.push(`${rest} Min.`)
  return parts.join(' ') || '0 Min.'
}

const twoDecimals = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Cost per kilometre, e.g. "0,23 €/km"; "–" when nothing was driven. */
export function formatEuroPerKm(centsPerKm: number | null): string {
  return centsPerKm === null ? '–' : `${twoDecimals.format(centsPerKm / 100)} €/km`
}

/** Fuel consumption, e.g. "6,4 l/100 km". */
export function formatConsumption(litersPer100Km: number | null): string {
  return litersPer100Km === null ? '–' : `${oneDecimal.format(litersPer100Km)} l/100 km`
}
