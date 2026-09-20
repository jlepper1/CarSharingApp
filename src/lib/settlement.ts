import type { DateRange } from '../data/DataProvider'
import type { Expense, ISODate, Profile, SplitRule, Trip, UUID } from '../data/types'
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
  /** paid minus owes. Positive means the others owe them money. */
  balanceCents: number
}

export interface Transfer {
  fromUserId: UUID
  toUserId: UUID
  amountCents: number
}

export interface SettlementResult {
  range: DateRange
  rule: SplitRule
  totalCents: number
  totalKm: number
  people: PersonSettlement[]
  transfers: Transfer[]
}

export interface SettlementInput {
  profiles: Profile[]
  trips: Trip[]
  expenses: Expense[]
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

export function computeSettlement(input: SettlementInput): SettlementResult {
  const { profiles, trips, expenses, rule, range } = input

  const tripsInRange = trips.filter((t) => isWithin(t.drivenOn, range))
  const accrued = expenses
    .map((expense) => ({ expense, cents: accruedCents(expense, range) }))
    .filter((entry) => entry.cents !== 0)

  // Include every active member, plus anyone inactive who still drove or paid
  // in this period - otherwise their money would silently vanish.
  const involved = new Set<UUID>()
  for (const profile of profiles) if (profile.active) involved.add(profile.id)
  for (const trip of tripsInRange) involved.add(trip.userId)
  for (const { expense } of accrued) involved.add(expense.userId)

  const members = profiles.filter((p) => involved.has(p.id))
  if (members.length === 0) {
    return { range, rule, totalCents: 0, totalKm: 0, people: [], transfers: [] }
  }

  const kmByUser = new Map<UUID, number>(members.map((m) => [m.id, 0]))
  for (const trip of tripsInRange) {
    const current = kmByUser.get(trip.userId)
    if (current === undefined) continue
    kmByUser.set(trip.userId, current + trip.distanceKm)
  }
  const kmWeights = members.map((m) => kmByUser.get(m.id) ?? 0)
  const totalKm = kmWeights.reduce((a, b) => a + b, 0)
  const equalWeights = members.map(() => 1)

  const paid = new Map<UUID, number>(members.map((m) => [m.id, 0]))
  const owes = new Map<UUID, number>(members.map((m) => [m.id, 0]))
  let totalCents = 0

  for (const { expense, cents } of accrued) {
    totalCents += cents

    // Credit the payer with the accrued amount, not the amount on the receipt.
    // Using the same figure on both sides is what makes the balances sum to zero.
    const paidSoFar = paid.get(expense.userId)
    if (paidSoFar !== undefined) {
      paid.set(expense.userId, paidSoFar + cents)
    }

    const weights = splitsByKm(rule, expense) ? kmWeights : equalWeights
    const shares = distributeCents(cents, weights)
    members.forEach((member, index) => {
      owes.set(member.id, (owes.get(member.id) ?? 0) + shares[index])
    })
  }

  const people: PersonSettlement[] = members.map((member) => {
    const paidCents = paid.get(member.id) ?? 0
    const owesCents = owes.get(member.id) ?? 0
    const distanceKm = kmByUser.get(member.id) ?? 0
    return {
      userId: member.id,
      displayName: member.displayName,
      distanceKm,
      kmShare: totalKm > 0 ? distanceKm / totalKm : 0,
      paidCents,
      owesCents,
      balanceCents: paidCents - owesCents,
    }
  })

  return { range, rule, totalCents, totalKm, people, transfers: settleUp(people) }
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
