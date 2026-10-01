import type { DateRange } from '../data/DataProvider'
import type {
  Expense,
  ExpenseCategory,
  ISODate,
  Profile,
  SettlementPayment,
  SplitRule,
  Trip,
  UUID,
} from '../data/types'
import { isFixedCategory } from '../data/types'

/**
 * Cost settlement ("Abrechnung").
 *
 * Pure functions, no database access, so the money logic can be unit-tested
 * directly rather than verified by clicking through the UI.
 *
 * All amounts are integer cents throughout.
 */

const DAY_MS = 86_400_000

/** Parse `YYYY-MM-DD` as UTC midnight, so no timezone can shift the day. */
export function parseISODate(date: ISODate): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function isWithin(date: ISODate, range: DateRange): boolean {
  const t = parseISODate(date)
  return t >= parseISODate(range.from) && t <= parseISODate(range.to)
}

/**
 * How much of an expense falls inside the settlement period.
 *
 * An expense without a period counts in full on the day it was incurred.
 * An expense carrying a period - a yearly Versicherung, say - accrues day by
 * day, so a single January payment does not distort the January settlement.
 */
export function accruedCents(expense: Expense, range: DateRange): number {
  const { periodStart, periodEnd } = expense

  if (!periodStart || !periodEnd) {
    return isWithin(expense.incurredOn, range) ? expense.amountCents : 0
  }

  const from = parseISODate(periodStart)
  const to = parseISODate(periodEnd)
  if (to < from) {
    // Nonsensical period; fall back to treating it as a one-off.
    return isWithin(expense.incurredOn, range) ? expense.amountCents : 0
  }

  const overlapFrom = Math.max(from, parseISODate(range.from))
  const overlapTo = Math.min(to, parseISODate(range.to))
  if (overlapTo < overlapFrom) return 0

  const periodDays = (to - from) / DAY_MS + 1
  const overlapDays = (overlapTo - overlapFrom) / DAY_MS + 1
  return Math.round((expense.amountCents * overlapDays) / periodDays)
}

/**
 * Split an amount across weights without losing or inventing a cent.
 *
 * Uses the largest-remainder method: everyone gets their floor, then the
 * leftover cents go to the largest fractional parts. The returned values
 * always sum to exactly `totalCents`.
 *
 * Weights that are all zero (nobody drove) fall back to an equal split rather
 * than dividing by zero.
 */
export function distributeCents(totalCents: number, weights: number[]): number[] {
  const count = weights.length
  if (count === 0) return []

  const sign = totalCents < 0 ? -1 : 1
  const total = Math.abs(Math.round(totalCents))

  let safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  let weightSum = safeWeights.reduce((a, b) => a + b, 0)
  if (weightSum <= 0) {
    safeWeights = new Array(count).fill(1)
    weightSum = count
  }

  const exact = safeWeights.map((w) => (total * w) / weightSum)
  const shares = exact.map(Math.floor)
  const leftover = total - shares.reduce((a, b) => a + b, 0)

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (let i = 0; i < leftover; i++) {
    shares[byFraction[i].index] += 1
  }

  return shares.map((value) => value * sign)
}

export interface PersonSettlement {
  userId: UUID
  displayName: string
  distanceKm: number
  /** Share of the period's kilometres, 0..1. */
  kmShare: number
  /** What this person actually paid out of pocket. */
  paidCents: number
  /** What this person's share of the costs comes to. */
  owesCents: number
  /**
   * Settlement payments already made: sent minus received. Paying a debt
   * raises the balance of the payer and lowers the balance of the receiver.
   */
  settledCents: number
  /** paid - owes + settled. Positive means the others owe them money. */
  balanceCents: number
}

export interface Transfer {
  fromUserId: UUID
  toUserId: UUID
  amountCents: number
}

/** How one expense was divided, so every figure can be traced to a receipt. */
export interface SettlementLine {
  expense: Expense
  /** The part of the expense that falls into the period. */
  accruedCents: number
  basis: 'km' | 'equal'
  sharesByUser: Map<UUID, number>
}

export interface SettlementResult {
  range: DateRange
  rule: SplitRule
  totalCents: number
  totalKm: number
  people: PersonSettlement[]
  transfers: Transfer[]
  lines: SettlementLine[]
}

export interface SettlementInput {
  profiles: Profile[]
  trips: Trip[]
  expenses: Expense[]
  /** Settlement payments already made; only those inside the range count. */
  payments?: SettlementPayment[]
  rule: SplitRule
  range: DateRange
}

/** Whether an expense is split by kilometres under the given rule. */
function splitsByKm(rule: SplitRule, expense: Expense): boolean {
  switch (rule) {
    case 'all_equal':
      return false
    case 'all_by_km':
      return true
    case 'fixed_equal_variable_km':
      return !isFixedCategory(expense.category)
  }
}

/**
 * Kilometres per person. A shared trip counts once and is split equally, so
 * three people on a 90 km trip get 30 km each and the per-person figures
 * still add up to the distance actually driven.
 */
export function kmByUser(trips: Trip[]): Map<UUID, number> {
  const totals = new Map<UUID, number>()
  for (const trip of trips) {
    const people = [...new Set(trip.participantIds)]
    if (people.length === 0) continue
    const share = trip.distanceKm / people.length
    for (const id of people) totals.set(id, (totals.get(id) ?? 0) + share)
  }
  return totals
}

/** Kilometres per person and car, for the "who drove which car" chart. */
export function kmByUserAndCar(trips: Trip[]): Map<UUID, Map<UUID, number>> {
  const totals = new Map<UUID, Map<UUID, number>>()
  for (const trip of trips) {
    const people = [...new Set(trip.participantIds)]
    if (people.length === 0) continue
    const share = trip.distanceKm / people.length
    for (const id of people) {
      const byCar = totals.get(id) ?? new Map<UUID, number>()
      byCar.set(trip.carId, (byCar.get(trip.carId) ?? 0) + share)
      totals.set(id, byCar)
    }
  }
  return totals
}

export function computeSettlement(input: SettlementInput): SettlementResult {
  const { profiles, trips, expenses, rule, range } = input

  const tripsInRange = trips.filter((t) => isWithin(t.drivenOn, range))
  const paymentsInRange = (input.payments ?? []).filter((p) => isWithin(p.appliesOn, range))
  const accrued = expenses
    .map((expense) => ({ expense, cents: accruedCents(expense, range) }))
    .filter((entry) => entry.cents !== 0)
  const driven = kmByUser(tripsInRange)

  // Include every active member, plus anyone inactive who still drove, paid or
  // was paid in this period - otherwise their money would silently vanish.
  const involved = new Set<UUID>()
  for (const profile of profiles) if (profile.active) involved.add(profile.id)
  for (const id of driven.keys()) involved.add(id)
  for (const { expense } of accrued) involved.add(expense.userId)
  for (const payment of paymentsInRange) {
    involved.add(payment.fromUserId)
    involved.add(payment.toUserId)
  }

  const members = profiles.filter((p) => involved.has(p.id))
  if (members.length === 0) {
    return { range, rule, totalCents: 0, totalKm: 0, people: [], transfers: [], lines: [] }
  }

  const kmWeights = members.map((m) => driven.get(m.id) ?? 0)
  // The distance driven, not the sum of shares, so rounding cannot creep in.
  const totalKm = tripsInRange.reduce((sum, t) => sum + t.distanceKm, 0)
  const equalWeights = members.map(() => 1)

  const paid = new Map<UUID, number>(members.map((m) => [m.id, 0]))
  const owes = new Map<UUID, number>(members.map((m) => [m.id, 0]))
  const settled = new Map<UUID, number>(members.map((m) => [m.id, 0]))
  const lines: SettlementLine[] = []
  let totalCents = 0

  for (const { expense, cents } of accrued) {
    totalCents += cents

    // Credit the payer with the accrued amount, not the amount on the receipt.
    // Using the same figure on both sides is what makes the balances sum to zero.
    const paidSoFar = paid.get(expense.userId)
    if (paidSoFar !== undefined) {
      paid.set(expense.userId, paidSoFar + cents)
    }

    const basis = splitsByKm(rule, expense) ? 'km' : 'equal'
    const shares = distributeCents(cents, basis === 'km' ? kmWeights : equalWeights)
    const sharesByUser = new Map<UUID, number>()
    members.forEach((member, index) => {
      owes.set(member.id, (owes.get(member.id) ?? 0) + shares[index])
      sharesByUser.set(member.id, shares[index])
    })
    lines.push({ expense, accruedCents: cents, basis, sharesByUser })
  }

  for (const payment of paymentsInRange) {
    const from = settled.get(payment.fromUserId)
    const to = settled.get(payment.toUserId)
    if (from === undefined || to === undefined) continue
    settled.set(payment.fromUserId, from + payment.amountCents)
    settled.set(payment.toUserId, to - payment.amountCents)
  }

  const people: PersonSettlement[] = members.map((member) => {
    const paidCents = paid.get(member.id) ?? 0
    const owesCents = owes.get(member.id) ?? 0
    const settledCents = settled.get(member.id) ?? 0
    const distanceKm = driven.get(member.id) ?? 0
    return {
      userId: member.id,
      displayName: member.displayName,
      distanceKm,
      kmShare: totalKm > 0 ? distanceKm / totalKm : 0,
      paidCents,
      owesCents,
      settledCents,
      balanceCents: paidCents - owesCents + settledCents,
    }
  })

  return { range, rule, totalCents, totalKm, people, transfers: settleUp(people), lines }
}

/** One row of the cost summary on the "Kosten" tab. */
export interface CostSummaryRow {
  category: ExpenseCategory
  /** Set for a bill spread over a period; such a bill gets its own row. */
  period: { start: ISODate; end: ISODate } | null
  /** The part that falls into the range - the month's share for a yearly bill. */
  cents: number
}

/**
 * The costs of a period by category. One-off costs are summed per category;
 * each bill spread over a period (a yearly Versicherung, say) gets its own row
 * with only the share for this period, so the total matches the settlement
 * instead of counting a yearly premium in full in every month it touches.
 */
export function costSummary(expenses: Expense[], range: DateRange): CostSummaryRow[] {
  const oneOff = new Map<ExpenseCategory, number>()
  const spread: CostSummaryRow[] = []
  for (const expense of expenses) {
    const cents = accruedCents(expense, range)
    if (cents === 0) continue
    if (expense.periodStart && expense.periodEnd) {
      spread.push({
        category: expense.category,
        period: { start: expense.periodStart, end: expense.periodEnd },
        cents,
      })
    } else {
      oneOff.set(expense.category, (oneOff.get(expense.category) ?? 0) + cents)
    }
  }

  const rows: CostSummaryRow[] = [
    ...[...oneOff].map(([category, cents]) => ({ category, period: null, cents })),
    ...spread,
  ]
  const order = (c: ExpenseCategory) => SUMMARY_ORDER.indexOf(c)
  return rows.sort(
    (a, b) =>
      order(a.category) - order(b.category) ||
      (a.period?.start ?? '').localeCompare(b.period?.start ?? ''),
  )
}

const SUMMARY_ORDER: ExpenseCategory[] = [
  'fuel',
  'insurance',
  'tax',
  'repair',
  'service',
  'tires',
  'other',
]

/** One row of a person's cost statement: an expense category for one car. */
export interface BreakdownRow {
  category: ExpenseCategory
  carId: UUID | null
  basis: 'km' | 'equal'
  /** Everyone's cost in this group for the period. */
  totalCents: number
  /** This person's part of it. */
  shareCents: number
  /** Number of receipts behind the row. */
  count: number
  /** At least one receipt is a yearly bill of which only part falls in the period. */
  partial: boolean
}

/**
 * A person's cost statement: the settlement lines grouped by category and car,
 * so a year with forty fuel receipts reads as one "Tanken · Golf" row. The
 * shares add up to the person's `owesCents` exactly.
 */
export function personBreakdown(result: SettlementResult, userId: UUID): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const line of result.lines) {
    const { expense } = line
    const key = `${line.basis}|${expense.category}|${expense.carId ?? ''}`
    const row = rows.get(key) ?? {
      category: expense.category,
      carId: expense.carId,
      basis: line.basis,
      totalCents: 0,
      shareCents: 0,
      count: 0,
      partial: false,
    }
    row.totalCents += line.accruedCents
    row.shareCents += line.sharesByUser.get(userId) ?? 0
    row.count += 1
    row.partial ||= line.accruedCents !== expense.amountCents
    rows.set(key, row)
  }
  const order = (r: BreakdownRow) => CATEGORY_SORT.indexOf(r.category)
  return [...rows.values()].sort(
    (a, b) => a.basis.localeCompare(b.basis) || order(a) - order(b) || b.totalCents - a.totalCents,
  )
}

const CATEGORY_SORT: ExpenseCategory[] = [
  'insurance',
  'tax',
  'fuel',
  'service',
  'repair',
  'tires',
  'other',
]

/** Key figures for one car, or for costs not tied to a car (`carId` null). */
export interface CarStats {
  carId: UUID | null
  km: number
  costCents: number
  /** Cost per kilometre in cents, or null when the car was not driven. */
  centsPerKm: number | null
  liters: number
  /** Litres per 100 km, or null without both litres and kilometres. */
  litersPer100Km: number | null
  /** Kilometres between consecutive trips that nobody entered. */
  gapKm: number
}

/**
 * Cost per kilometre, fuel consumption and unrecorded kilometres per car.
 *
 * Gaps only look at trips inside the period, so a gap spanning the start of
 * the period shows up in the earlier one.
 */
export function carStats(trips: Trip[], expenses: Expense[], range: DateRange): CarStats[] {
  const tripsInRange = trips.filter((t) => isWithin(t.drivenOn, range))
  const carIds = new Set<UUID | null>()
  for (const trip of tripsInRange) carIds.add(trip.carId)
  for (const expense of expenses) {
    if (accruedCents(expense, range) !== 0) carIds.add(expense.carId)
  }

  return [...carIds].map((carId) => {
    const carTrips = tripsInRange
      .filter((t) => t.carId === carId)
      .sort((a, b) => a.odometerStart - b.odometerStart)
    const km = carTrips.reduce((sum, t) => sum + t.distanceKm, 0)

    let gapKm = 0
    for (let i = 1; i < carTrips.length; i++) {
      const gap = carTrips[i].odometerStart - carTrips[i - 1].odometerEnd
      if (gap > 0) gapKm += gap
    }

    const carExpenses = expenses.filter((e) => e.carId === carId)
    const costCents = carExpenses.reduce((sum, e) => sum + accruedCents(e, range), 0)
    const liters = carExpenses
      .filter((e) => e.category === 'fuel' && e.liters && isWithin(e.incurredOn, range))
      .reduce((sum, e) => sum + (e.liters ?? 0), 0)

    return {
      carId,
      km,
      costCents,
      centsPerKm: carId !== null && km > 0 ? costCents / km : null,
      liters,
      litersPer100Km: km > 0 && liters > 0 ? (liters / km) * 100 : null,
      gapKm,
    }
  })
}

/**
 * Turn balances into the fewest sensible payments: repeatedly match the
 * largest debtor against the largest creditor.
 */
export function settleUp(people: PersonSettlement[]): Transfer[] {
  const debtors = people
    .filter((p) => p.balanceCents < 0)
    .map((p) => ({ id: p.userId, amount: -p.balanceCents }))
    .sort((a, b) => b.amount - a.amount)

  const creditors = people
    .filter((p) => p.balanceCents > 0)
    .map((p) => ({ id: p.userId, amount: p.balanceCents }))
    .sort((a, b) => b.amount - a.amount)

  const transfers: Transfer[] = []
  let d = 0
  let c = 0

  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount)
    if (amount > 0) {
      transfers.push({
        fromUserId: debtors[d].id,
        toUserId: creditors[c].id,
        amountCents: amount,
      })
    }
    debtors[d].amount -= amount
    creditors[c].amount -= amount
    if (debtors[d].amount === 0) d++
    if (creditors[c].amount === 0) c++
  }

  return transfers
}
