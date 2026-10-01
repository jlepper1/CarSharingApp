import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  InfoBanner,
  Screen,
  Spinner,
} from '../components/ui'
import MonthPicker from '../components/MonthPicker'
import CostShareChart from '../components/charts/CostShareChart'
import KmByCarChart from '../components/charts/KmByCarChart'
import UsageTimeline from '../components/charts/UsageTimeline'
import { useApp, useProfileLookup } from '../context/AppContext'
import { SPLIT_RULE_LABELS } from '../data/types'
import { formatDateISO } from '../lib/dates'
import { buildSettlementCsv, downloadCsv } from '../lib/exportCsv'
import {
  formatCents,
  formatConsumption,
  formatEuroPerKm,
  formatKm,
  formatPercent,
} from '../lib/format'
import { carStats, type Transfer } from '../lib/settlement'
import { periodLabel, useSettlementPeriod } from '../lib/useSettlementPeriod'
import { useSettlementData } from '../lib/useSettlementData'

export default function SettlementScreen() {
  const { provider, profiles, cars } = useApp()
  const lookup = useProfileLookup()

  const { period, month, range, query, setPeriod, setMonth } = useSettlementPeriod()
  const { trips, expenses, bookings, payments, result, loading, error, reload } =
    useSettlementData(range)
  const [actionError, setActionError] = useState<string | null>(null)

  const stats = useMemo(() => carStats(trips, expenses, range), [trips, expenses, range])
  const carName = (id: string | null) =>
    id === null ? 'Ohne Auto' : (cars.find((c) => c.id === id)?.name ?? 'Auto')
  const label = periodLabel(period, month)
  const name = (id: string) => lookup(id)?.displayName ?? '?'

  async function markPaid(transfer: Transfer) {
    const question = `Hat ${name(transfer.fromUserId)} ${formatCents(transfer.amountCents)} an ${name(transfer.toUserId)} überwiesen? Als bezahlt markieren.`
    if (!confirm(question)) return
    setActionError(null)
    const saved = await provider.createPayment({
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      amountCents: transfer.amountCents,
      // Counts on the last day of the period it settles.
      appliesOn: range.to,
      note: null,
    })
    if (!saved.ok) setActionError(saved.message)
    else void reload(true)
  }

  async function undoPayment(id: string) {
    if (!confirm('Diese Ausgleichszahlung wieder als offen markieren?')) return
    setActionError(null)
    const removed = await provider.deletePayment(id)
    if (!removed.ok) setActionError(removed.message)
    else void reload(true)
  }

  function exportCsv() {
    if (!result) return
    const text = buildSettlementCsv({ result, trips, payments, profiles, cars, periodLabel: label })
    const stamp =
      period === 'year'
        ? String(month.getFullYear())
        : `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
    downloadCsv(`abrechnung-${stamp}.csv`, text)
  }

  const empty =
    !result || (result.totalCents === 0 && result.totalKm === 0 && payments.length === 0)

  return (
    <Screen
      title="Abrechnung"
      action={
        loading || empty ? null : (
          <div className="flex gap-1 print:hidden">
            <Button variant="ghost" className="px-2" onClick={exportCsv}>
              CSV
            </Button>
            <Button variant="ghost" className="px-2" onClick={() => window.print()}>
              Drucken / PDF
            </Button>
          </div>
        )
      }
    >
      <ErrorBanner message={error ?? actionError} />

      <div className="mb-3 flex gap-2 print:hidden">
        <PeriodTab active={period === 'month'} onClick={() => setPeriod('month')}>
          Monat
        </PeriodTab>
        <PeriodTab active={period === 'year'} onClick={() => setPeriod('year')}>
          Jahr
        </PeriodTab>
      </div>

      <MonthPicker month={month} onChange={setMonth} unit={period} />

      {loading || !result ? (
        <Spinner label="Abrechnung wird berechnet …" />
      ) : empty ? (
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

          {stats
            .filter((s) => s.gapKm > 0)
            .map((s) => (
              <InfoBanner key={s.carId ?? 'none'}>
                {carName(s.carId)}: {formatKm(s.gapKm)} ohne eingetragene Fahrt – diese km zahlen
                alle über den km-Anteil mit. Fehlt eine Fahrt?
              </InfoBanner>
            ))}

          {stats.length > 0 ? (
            <>
              <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Je Auto</h2>
              <Card className="mb-3">
                <ul className="divide-y divide-slate-100">
                  {stats.map((s) => (
                    <li key={s.carId ?? 'none'} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-800">{carName(s.carId)}</span>
                        <span className="tabular-nums text-slate-900">
                          {formatCents(s.costCents)}
                        </span>
                      </div>
                      {s.carId !== null ? (
                        <div className="mt-0.5 text-xs tabular-nums text-slate-500">
                          {formatKm(s.km)} · {formatEuroPerKm(s.centsPerKm)}
                          {s.litersPer100Km !== null
                            ? ` · ${formatConsumption(s.litersPer100Km)}`
                            : ''}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-slate-500">
                          Kosten, die keinem Auto zugeordnet sind
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : null}

          <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Pro Person</h2>
          <ul className="space-y-2">
            {result.people.map((person) => {
              const profile = lookup(person.userId)
              const positive = person.balanceCents > 0
              return (
                <li key={person.userId}>
                  <Link
                    to={`/abrechnung/person/${person.userId}?${query}`}
                    className="block"
                    aria-label={`Kostenaufstellung für ${person.displayName}`}
                  >
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
                        <span aria-hidden className="text-slate-300 print:hidden">
                          ›
                        </span>
                      </div>
                      <dl className="grid grid-cols-3 gap-2 text-xs">
                        <Stat label="Gefahren">
                          {formatKm(person.distanceKm)}
                          <span className="ml-1 text-slate-400">
                            {formatPercent(person.kmShare)}
                          </span>
                        </Stat>
                        <Stat label="Bezahlt">{formatCents(person.paidCents)}</Stat>
                        <Stat label="Anteil">{formatCents(person.owesCents)}</Stat>
                      </dl>
                      {person.settledCents !== 0 ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Ausgleich bereits {person.settledCents > 0 ? 'überwiesen' : 'erhalten'}:{' '}
                          {formatCents(Math.abs(person.settledCents))}
                        </p>
                      ) : null}
                    </Card>
                  </Link>
                </li>
              )
            })}
          </ul>

          <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Ausgleich</h2>
          {result.transfers.length === 0 ? (
            <EmptyState>Alles ausgeglichen – niemand schuldet jemandem etwas.</EmptyState>
          ) : (
            <Card>
              <ul className="space-y-3">
                {result.transfers.map((transfer, index) => (
                  <li
                    key={`${transfer.fromUserId}-${transfer.toUserId}-${index}`}
                    className="text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-700">
                        <strong>{name(transfer.fromUserId)}</strong> zahlt an{' '}
                        <strong>{name(transfer.toUserId)}</strong>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                        {formatCents(transfer.amountCents)}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-1.5 min-h-9 w-full print:hidden"
                      onClick={() => void markPaid(transfer)}
                    >
                      Als bezahlt markieren
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {payments.length > 0 ? (
            <>
              <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">
                Erledigte Zahlungen
              </h2>
              <Card>
                <ul className="space-y-2">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className="text-slate-700">
                        {name(p.fromUserId)} → {name(p.toUserId)}{' '}
                        <strong className="tabular-nums">{formatCents(p.amountCents)}</strong> ✓
                        <span className="block text-xs text-slate-500">
                          gilt für {formatDateISO(p.appliesOn)}
                          {p.createdBy ? ` · eingetragen von ${name(p.createdBy)}` : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void undoPayment(p.id)}
                        className="shrink-0 text-xs text-brand-700 print:hidden"
                      >
                        rückgängig
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : null}

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Auswertung</h2>
          <KmByCarChart trips={trips} cars={cars} profiles={profiles} />
          <CostShareChart people={result.people} />
          <UsageTimeline
            bookings={bookings}
            trips={trips}
            cars={cars}
            profiles={profiles}
            range={range}
            period={period}
          />
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
