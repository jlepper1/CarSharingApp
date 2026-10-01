import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import type { DateRange } from '../data/DataProvider'
import type { Booking, Expense, SettlementPayment, Trip } from '../data/types'
import { computeSettlement } from './settlement'
import { useLiveReload } from './useLiveReload'

/**
 * Everything the settlement and the per-person statement need for a period,
 * loaded once and kept live. Both pages use this, so they can never disagree.
 */
export function useSettlementData(range: DateRange) {
  const { provider, profiles, settings } = useApp()

  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [payments, setPayments] = useState<SettlementPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** `quiet` keeps the current figures on screen during a live refresh. */
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      setError(null)
      try {
        const [nextTrips, nextExpenses, nextBookings, nextPayments] = await Promise.all([
          provider.listTrips(range),
          provider.listExpenses(range),
          provider.listBookings(range),
          provider.listPayments(range),
        ])
        setTrips(nextTrips)
        setExpenses(nextExpenses)
        setBookings(nextBookings)
        setPayments(nextPayments)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [provider, range],
  )

  useEffect(() => {
    void load()
  }, [load])

  useLiveReload(['trips', 'expenses', 'bookings', 'settlement_payments'], () => void load(true))

  const result = useMemo(() => {
    if (!settings) return null
    return computeSettlement({
      profiles,
      trips,
      expenses,
      payments,
      rule: settings.splitRule,
      range,
    })
  }, [profiles, trips, expenses, payments, settings, range])

  return { trips, expenses, bookings, payments, result, loading, error, reload: load }
}
