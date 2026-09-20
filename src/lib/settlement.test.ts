import { describe, expect, it } from 'vitest'
import type { DateRange } from '../data/DataProvider'
import type { Expense, ExpenseCategory, Profile, Trip } from '../data/types'
import {
  accruedCents,
  computeSettlement,
  distributeCents,
  settleUp,
} from './settlement'

/**
 * The money logic is the part of this app that must not be wrong, so it is
 * verified here with worked examples rather than by clicking through the UI.
 */

const ANNA = 'user-anna'
const BERND = 'user-bernd'

const profiles: Profile[] = [
  { id: ANNA, displayName: 'Anna', color: '#0f766e', active: true },
  { id: BERND, displayName: 'Bernd', color: '#b45309', active: true },
]

const JANUARY: DateRange = { from: '2026-01-01', to: '2026-01-31' }

function trip(userId: string, km: number, drivenOn = '2026-01-10'): Trip {
  return {
    id: `trip-${userId}-${km}`,
    carId: 'car-1',
    userId,
    bookingId: null,
    drivenOn,
    odometerStart: 0,
    odometerEnd: km,
    distanceKm: km,
    note: null,
  }
}

function expense(
  userId: string,
  category: ExpenseCategory,
  amountCents: number,
  extra: Partial<Expense> = {},
): Expense {
  return {
    id: `exp-${userId}-${category}-${amountCents}`,
    carId: 'car-1',
    userId,
    category,
    amountCents,
    incurredOn: '2026-01-15',
    periodStart: null,
    periodEnd: null,
    liters: null,
    note: null,
    receiptPath: null,
    ...extra,
  }
}

// Anna drives 700 km, Bernd 300 km. Anna pays 100 EUR fuel, Bernd pays the
// 800 EUR yearly insurance up front on 1 January.
const trips = [trip(ANNA, 700), trip(BERND, 300)]
const expenses = [
  expense(ANNA, 'fuel', 10_000),
  expense(BERND, 'insurance', 80_000, {
    incurredOn: '2026-01-01',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
  }),
]

/** 31 of 365 days of an 800 EUR premium falls into January. */
const INSURANCE_IN_JANUARY = 6_795

describe('accruedCents', () => {
  it('counts a one-off expense in full inside its range', () => {
    expect(accruedCents(expense(ANNA, 'fuel', 10_000), JANUARY)).toBe(10_000)
  })

  it('ignores a one-off expense outside the range', () => {
    const february = expense(ANNA, 'fuel', 10_000, { incurredOn: '2026-02-03' })
    expect(accruedCents(february, JANUARY)).toBe(0)
  })

  it('spreads a yearly premium across the days it covers', () => {
    expect(accruedCents(expenses[1], JANUARY)).toBe(INSURANCE_IN_JANUARY)
  })

  it('accrues the whole premium over the whole year', () => {
    const fullYear: DateRange = { from: '2026-01-01', to: '2026-12-31' }
    expect(accruedCents(expenses[1], fullYear)).toBe(80_000)
  })

  it('returns nothing for a period that does not overlap the range', () => {
    const lastYear = expense(BERND, 'tax', 20_000, {
      incurredOn: '2025-01-01',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
    })
    expect(accruedCents(lastYear, JANUARY)).toBe(0)
  })
})

describe('distributeCents', () => {
  it('never loses a cent when the split is uneven', () => {
    const shares = distributeCents(100, [1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
    expect(shares).toEqual([34, 33, 33])
  })

  it('splits proportionally to the weights', () => {
    expect(distributeCents(10_000, [700, 300])).toEqual([7_000, 3_000])
  })

  it('falls back to an equal split when every weight is zero', () => {
    expect(distributeCents(90, [0, 0, 0])).toEqual([30, 30, 30])
  })

  it('handles a negative amount, for a refund', () => {
    const shares = distributeCents(-100, [1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(-100)
  })

  it('always sums to the exact total across many awkward amounts', () => {
    for (let total = 0; total < 500; total++) {
      const shares = distributeCents(total, [700, 300, 17, 1, 0])
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
    }
  })
})

describe('computeSettlement', () => {
  it('splits fixed costs equally and variable costs by kilometre', () => {
    const result = computeSettlement({
      profiles,
      trips,
      expenses,
      rule: 'fixed_equal_variable_km',
      range: JANUARY,
    })

    expect(result.totalKm).toBe(1_000)
    expect(result.totalCents).toBe(10_000 + INSURANCE_IN_JANUARY)

    const anna = result.people.find((p) => p.userId === ANNA)!
    const bernd = result.people.find((p) => p.userId === BERND)!

    // Fuel follows the kilometres (7000 / 3000), insurance is split evenly
    // (3398 / 3397 - the odd cent goes to the larger remainder).
    expect(anna.owesCents).toBe(7_000 + 3_398)
    expect(bernd.owesCents).toBe(3_000 + 3_397)

    expect(anna.paidCents).toBe(10_000)
    expect(bernd.paidCents).toBe(INSURANCE_IN_JANUARY)

    expect(anna.balanceCents).toBe(-398)
    expect(bernd.balanceCents).toBe(398)
  })

  it('splits everything by kilometre under all_by_km', () => {
    const result = computeSettlement({
      profiles,
      trips,
      expenses,
      rule: 'all_by_km',
      range: JANUARY,
    })

    const anna = result.people.find((p) => p.userId === ANNA)!
    const bernd = result.people.find((p) => p.userId === BERND)!

    expect(anna.owesCents).toBe(7_000 + 4_757)
    expect(bernd.owesCents).toBe(3_000 + 2_038)
    expect(anna.balanceCents).toBe(-1_757)
    expect(bernd.balanceCents).toBe(1_757)
  })

  it('splits everything evenly under all_equal, ignoring kilometres', () => {
    const result = computeSettlement({
      profiles,
      trips,
      expenses,
      rule: 'all_equal',
      range: JANUARY,
    })

    const anna = result.people.find((p) => p.userId === ANNA)!
    const bernd = result.people.find((p) => p.userId === BERND)!

    expect(anna.owesCents).toBe(5_000 + 3_398)
    expect(bernd.owesCents).toBe(5_000 + 3_397)
    // Anna paid the fuel and drove more, but that no longer matters.
    expect(anna.balanceCents).toBe(1_602)
    expect(bernd.balanceCents).toBe(-1_602)
  })

  it('reports each person kilometre share', () => {
    const result = computeSettlement({
      profiles,
      trips,
      expenses,
      rule: 'all_by_km',
      range: JANUARY,
    })
    const anna = result.people.find((p) => p.userId === ANNA)!
    expect(anna.distanceKm).toBe(700)
    expect(anna.kmShare).toBeCloseTo(0.7)
  })

  it('falls back to an equal split when nobody drove', () => {
    const result = computeSettlement({
      profiles,
      trips: [],
      expenses: [expense(ANNA, 'fuel', 10_001)],
      rule: 'all_by_km',
      range: JANUARY,
    })

    expect(result.totalKm).toBe(0)
    const owed = result.people.map((p) => p.owesCents).sort((a, b) => b - a)
    expect(owed).toEqual([5_001, 5_000])
    expect(result.people.every((p) => p.kmShare === 0)).toBe(true)
  })

  it('always produces balances that cancel out', () => {
    for (const rule of ['fixed_equal_variable_km', 'all_by_km', 'all_equal'] as const) {
      const result = computeSettlement({ profiles, trips, expenses, rule, range: JANUARY })
      const sum = result.people.reduce((a, p) => a + p.balanceCents, 0)
      expect(sum).toBe(0)
      // What everyone owes is exactly what was spent.
      expect(result.people.reduce((a, p) => a + p.owesCents, 0)).toBe(result.totalCents)
    }
  })

  it('excludes trips and costs from outside the period', () => {
    const result = computeSettlement({
      profiles,
      trips: [...trips, trip(ANNA, 5_000, '2026-03-01')],
      expenses: [expense(ANNA, 'fuel', 10_000, { incurredOn: '2026-03-01' })],
      rule: 'all_by_km',
      range: JANUARY,
    })
    expect(result.totalKm).toBe(1_000)
    expect(result.totalCents).toBe(0)
  })

  it('still counts someone who left the family but paid during the period', () => {
    const withInactive: Profile[] = [
      ...profiles,
      { id: 'user-old', displayName: 'Carla', color: '#7c3aed', active: false },
    ]
    const result = computeSettlement({
      profiles: withInactive,
      trips,
      expenses: [expense('user-old', 'fuel', 10_000)],
      rule: 'all_equal',
      range: JANUARY,
    })
    const carla = result.people.find((p) => p.userId === 'user-old')
    expect(carla?.paidCents).toBe(10_000)
  })
})

describe('settleUp', () => {
  it('matches debtors against creditors with the fewest payments', () => {
    const transfers = settleUp([
      { userId: 'a', displayName: 'A', distanceKm: 0, kmShare: 0, paidCents: 0, owesCents: 0, balanceCents: -1_000 },
      { userId: 'b', displayName: 'B', distanceKm: 0, kmShare: 0, paidCents: 0, owesCents: 0, balanceCents: -500 },
      { userId: 'c', displayName: 'C', distanceKm: 0, kmShare: 0, paidCents: 0, owesCents: 0, balanceCents: 1_500 },
    ])

    expect(transfers).toHaveLength(2)
    expect(transfers.every((t) => t.toUserId === 'c')).toBe(true)
    expect(transfers.reduce((a, t) => a + t.amountCents, 0)).toBe(1_500)
  })

  it('produces no payments when everyone is square', () => {
    const transfers = settleUp([
      { userId: 'a', displayName: 'A', distanceKm: 0, kmShare: 0, paidCents: 100, owesCents: 100, balanceCents: 0 },
    ])
    expect(transfers).toEqual([])
  })
})
