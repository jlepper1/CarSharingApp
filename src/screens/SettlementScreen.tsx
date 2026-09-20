import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, EmptyState, ErrorBanner, InfoBanner, Screen, Spinner } from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Expense, Trip } from '../data/types'
import { SPLIT_RULE_LABELS } from '../data/types'
import { monthRange, yearRange } from '../lib/dates'
import { formatCents, formatKm, formatPercent } from '../lib/format'
import { computeSettlement } from '../lib/settlement'

type Period = 'month' | 'year'

export default function SettlementScreen() {
  const { provider, profiles, settings } = useApp()
  const lookup = useProfileLookup()

  const [period, setPeriod] = useState<Period>('month')
  const [month, setMonth] = useState(() => new Date())
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(
    () =>
      period === 'month'
        ? monthRange(month.getFullYear(), month.getMonth())
        : yearRange(month.getFullYear()),
    [period, month],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextTrips, nextExpenses] = await Promise.all([
        provider.listTrips(range),
        provider.listExpenses(range),
      ])
      setTrips(nextTrips)
      setExpenses(nextExpenses)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [provider, range])

  useEffect(() => {
    void load()
  }, [load])

  const result = useMemo(() => {
    if (!settings) return null
    return computeSettlement({ profiles, trips, expenses, rule: settings.splitRule, range })
  }, [profiles, trips, expenses, settings, range])

  return (
    <Screen title="Abrechnung">
      <ErrorBanner message={error} />

      <div className="mb-3 flex gap-2">
        <PeriodTab active={period === 'month'} onClick={() => setPeriod('month')}>
          Monat
        </PeriodTab>
        <PeriodTab active={period === 'year'} onClick={() => setPeriod('year')}>
          Jahr {month.getFullYear()}
        </PeriodTab>
      </div>

      <MonthPicker month={month} onChange={setMonth} />

      {loading || !result ? (
        <Spinner label="Abrechnung wird berechnet …" />
      ) : result.totalCents === 0 && result.totalKm === 0 ? (
        <EmptyState>Für diesen Zeitraum gibt es noch keine Fahrten und keine Kosten.</EmptyState>
      ) : (
        <>
          <Card className="mb-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Kosten gesamt</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatCents(result.totalCents)}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-slate-600">Kilometer gesamt</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatKm(result.totalKm)}
              </span>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
              Verteilung: {SPLIT_RULE_LABELS[result.rule]}. Änderbar unter „Mehr“.
            </p>
          </Card>

          {result.totalKm === 0 && result.totalCents > 0 ? (
            <InfoBanner>
              In diesem Zeitraum wurden keine Kilometer eingetragen. Die Kosten werden deshalb
              gleichmäßig verteilt.
            </InfoBanner>
          ) : null}

          <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Pro Person</h2>
          <ul className="space-y-2">
            {result.people.map((person) => {
              const profile = lookup(person.userId)
              const positive = person.balanceCents > 0
              return (
                <li key={person.userId}>
                  <Card>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: profile?.color ?? '#94a3b8' }}
                      />
                      <span className="flex-1 text-sm font-medium text-slate-800">
                        {person.displayName}
                      </span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          person.balanceCents === 0
                            ? 'text-slate-500'
                            : positive
                              ? 'text-emerald-700'
                              : 'text-red-700'
                        }`}
                      >
                        {person.balanceCents === 0
                          ? 'ausgeglichen'
                          : positive
                            ? `bekommt ${formatCents(person.balanceCents)}`
                            : `zahlt ${formatCents(-person.balanceCents)}`}
                      </span>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <Stat label="Gefahren">
                        {formatKm(person.distanceKm)}
                        <span className="ml-1 text-slate-400">{formatPercent(person.kmShare)}</span>
                      </Stat>
                      <Stat label="Bezahlt">{formatCents(person.paidCents)}</Stat>
                      <Stat label="Anteil">{formatCents(person.owesCents)}</Stat>
                    </dl>
                  </Card>
                </li>
              )
            })}
          </ul>

          <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Ausgleich</h2>
          {result.transfers.length === 0 ? (
            <EmptyState>Alles ausgeglichen – niemand schuldet jemandem etwas.</EmptyState>
          ) : (
            <Card>
              <ul className="space-y-2">
                {result.transfers.map((transfer, index) => (
                  <li
                    key={`${transfer.fromUserId}-${transfer.toUserId}-${index}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-slate-700">
                      <strong>{lookup(transfer.fromUserId)?.displayName ?? '?'}</strong> zahlt an{' '}
                      <strong>{lookup(transfer.toUserId)?.displayName ?? '?'}</strong>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {formatCents(transfer.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Screen>
  )
}

function PeriodTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-brand-700 text-white' : 'border border-slate-300 bg-white text-slate-600'
      }`}
    >
      {children}
    </button>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-800">{children}</dd>
    </div>
  )
}
