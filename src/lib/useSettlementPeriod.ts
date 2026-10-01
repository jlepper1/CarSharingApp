import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DateRange } from '../data/DataProvider'
import { monthRange, yearRange } from './dates'

export type Period = 'month' | 'year'

/**
 * The settlement period lives in the URL (`?zeitraum=jahr&datum=2026-07`), so
 * the person detail page and the back button land on exactly the same period.
 */
export function useSettlementPeriod() {
  const [params, setParams] = useSearchParams()

  const period: Period = params.get('zeitraum') === 'jahr' ? 'year' : 'month'
  const datum = params.get('datum')

  const month = useMemo(() => {
    const match = datum ? /^(\d{4})-(\d{2})$/.exec(datum) : null
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1)
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [datum])

  const range: DateRange = useMemo(
    () =>
      period === 'month'
        ? monthRange(month.getFullYear(), month.getMonth())
        : yearRange(month.getFullYear()),
    [period, month],
  )

  const update = useCallback(
    (nextPeriod: Period, nextMonth: Date) => {
      setParams(periodQuery(nextPeriod, nextMonth), { replace: true })
    },
    [setParams],
  )

  return {
    period,
    month,
    range,
    /** Query string to carry the period over to another page. */
    query: periodQuery(period, month),
    setPeriod: (next: Period) => update(next, month),
    setMonth: (next: Date) => update(period, next),
  }
}

export function periodQuery(period: Period, month: Date): string {
  const datum = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  return new URLSearchParams({ zeitraum: period === 'year' ? 'jahr' : 'monat', datum }).toString()
}

/** "Juli 2026" or "2026", for headings that name the period. */
export function periodLabel(period: Period, month: Date): string {
  if (period === 'year') return String(month.getFullYear())
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(month)
}
