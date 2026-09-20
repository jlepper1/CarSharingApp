/**
 * Domain types for the family car sharing app.
 *
 * These are backend-agnostic on purpose: the Supabase provider (and any later
 * OneDrive provider) maps its own row shape onto these types, so the UI never
 * sees a backend-specific field name.
 */

export type UUID = string
/** Calendar day, `YYYY-MM-DD`. */
export type ISODate = string
/** Instant in time, full ISO 8601 string. */
export type ISODateTime = string

export interface Profile {
  id: UUID
  displayName: string
  /** Hex colour used to identify this person in the calendar. */
  color: string
  active: boolean
}

export interface Car {
  id: UUID
  name: string
  licensePlate: string | null
  /** Odometer reading when the car was added, in km. */
  initialOdometer: number
  active: boolean
}

export interface Booking {
  id: UUID
  carId: UUID
  userId: UUID
  startsAt: ISODateTime
  endsAt: ISODateTime
  purpose: string | null
}

export interface Trip {
  id: UUID
  carId: UUID
  userId: UUID
  bookingId: UUID | null
  drivenOn: ISODate
  odometerStart: number
  odometerEnd: number
  /** Derived from the odometer readings, never entered by hand. */
  distanceKm: number
  note: string | null
}

export type ExpenseCategory =
  | 'fuel'
  | 'insurance'
  | 'tax'
  | 'repair'
  | 'service'
  | 'tires'
  | 'other'

export interface Expense {
  id: UUID
  carId: UUID | null
  /** Who actually paid the bill. */
  userId: UUID
  category: ExpenseCategory
  /** Integer cents. Never a float — money and floating point do not mix. */
  amountCents: number
  incurredOn: ISODate
  /**
   * Period the cost covers. A yearly insurance premium paid in January carries
   * period_start 01-01 and period_end 12-31, so the settlement can accrue it
   * day by day instead of dumping it all into January.
   */
  periodStart: ISODate | null
  periodEnd: ISODate | null
  /** Litres filled, for fuel expenses only. */
  liters: number | null
  note: string | null
  receiptPath: string | null
}

/**
 * How costs are divided across the family.
 *
 * - `fixed_equal_variable_km` — Versicherung and Steuer are the same no matter
 *   who drives, so they are split equally; everything else follows kilometres.
 * - `all_by_km` — whoever drives most pays most of everything.
 * - `all_equal` — everything split evenly; kilometres are informational only.
 */
export type SplitRule = 'fixed_equal_variable_km' | 'all_by_km' | 'all_equal'

export interface Settings {
  splitRule: SplitRule
  currency: string
}

/** Categories that cost the same regardless of how far the car is driven. */
export const FIXED_CATEGORIES: readonly ExpenseCategory[] = ['insurance', 'tax']

export function isFixedCategory(category: ExpenseCategory): boolean {
  return FIXED_CATEGORIES.includes(category)
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'Tanken',
  insurance: 'KFZ-Versicherung',
  tax: 'KFZ-Steuer',
  repair: 'Reparatur',
  service: 'Wartung',
  tires: 'Reifen',
  other: 'Sonstiges',
}

export const SPLIT_RULE_LABELS: Record<SplitRule, string> = {
  fixed_equal_variable_km: 'Fixkosten gleich, Verbrauch nach km',
  all_by_km: 'Alles nach gefahrenen Kilometern',
  all_equal: 'Alles zu gleichen Teilen',
}

export const SPLIT_RULE_DESCRIPTIONS: Record<SplitRule, string> = {
  fixed_equal_variable_km:
    'Versicherung und Steuer werden gleichmäßig auf alle verteilt. Sprit, Reparaturen, Wartung und Reifen nach dem Anteil an den gefahrenen Kilometern.',
  all_by_km:
    'Alle Kosten werden nach dem Anteil an den gefahrenen Kilometern verteilt. Wer mehr fährt, zahlt mehr.',
  all_equal:
    'Alle Kosten werden gleichmäßig auf alle verteilt. Die Kilometer dienen nur zur Information.',
}
