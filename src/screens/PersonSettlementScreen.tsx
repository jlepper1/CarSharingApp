import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorBanner, Screen, Spinner } from '../components/ui'
import { useApp, useProfileLookup } from '../context/AppContext'
import { CATEGORY_LABELS } from '../data/types'
import { formatDateISO } from '../lib/dates'
import { formatCents, formatEuroPerKm, formatKm, formatPercent } from '../lib/format'
import { carStats, personBreakdown, type BreakdownRow } from '../lib/settlement'
import { periodLabel, useSettlementPeriod } from '../lib/useSettlementPeriod'
import { useSettlementData } from '../lib/useSettlementData'

/**
 * One person's cost statement: every cost of the period, what it came to in
 * total and what this person's part is, then the reconciliation
 * share - paid - settled = balance, matching the card on the settlement page.
 */
export default function PersonSettlementScreen() {
  const { userId = '' } = useParams()
  const { cars } = useApp()
  const lookup = useProfileLookup()
  const { period, month, range, query } = useSettlementPeriod()
  const { trips, expenses, result, loading, error } = useSettlementData(range)

  const person = result?.people.find((p) => p.userId === userId) ?? null
  const rows = useMemo(
    () => (result && person ? personBreakdown(result, person.userId) : []),
    [result, person],
  )
  const ownReceipts = useMemo(
    () =>
      (result?.lines ?? [])
        .filter((l) => l.expense.userId === userId)
        .sort((a, b) => a.expense.incurredOn.localeCompare(b.expense.incurredOn)),
    [result, userId],
  )
  // €/km over all cars: the figure the km-based share is actually computed from.
  const kmCostCents = rows.filter((r) => r.basis === 'km').reduce((a, r) => a + r.totalCents, 0)
  const stats = useMemo(() => carStats(trips, expenses, range), [trips, expenses, range])

  const label = periodLabel(period, month)
  const profile = lookup(userId)
  const carName = (id: string | null) =>
    id === null ? 'ohne Auto' : (cars.find((c) => c.id === id)?.name ?? 'Auto')

  const fixed = rows.filter((r) => r.basis === 'equal')
  const usage = rows.filter((r) => r.basis === 'km')

  return (
    <Screen
      title={profile?.displayName ?? 'Person'}
      back={{ to: `/abrechnung?${query}`, label: 'Zurück zur Abrechnung' }}
      action={
        person ? (
          <Button variant="ghost" className="px-2 print:hidden" onClick={() => window.print()}>
            Drucken / PDF
          </Button>
        ) : null
      }
    >
      <ErrorBanner message={error} />

      {loading || !result ? (
        <Spinner label="Aufstellung wird berechnet …" />
      ) : !person ? (
        <EmptyState>Für diese Person gibt es in {label} keine Abrechnung.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: profile?.color ?? '#94a3b8' }}
            />
            <span className="text-sm text-slate-600">Kostenaufstellung {label}</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState>In diesem Zeitraum sind keine Kosten angefallen.</EmptyState>
          ) : (
            <Card className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="pb-2 text-left font-medium">Posten</th>
                    <th className="pb-2 text-right font-medium">Gesamt</th>
                    <th className="pb-2 text-right font-medium">Anteil</th>
                  </tr>
                </thead>
                {fixed.length > 0 ? (
                  <Section
                    title={usage.length > 0 ? 'Fixkosten – gleich verteilt' : 'Gleich verteilt'}
                    rows={fixed}
                    carName={carName}
                  />
                ) : null}
                {usage.length > 0 ? (
                  <Section
                    title={fixed.length > 0 ? 'Nutzungskosten – nach km' : 'Nach km verteilt'}
                    rows={usage}
                    carName={carName}
                    km={{ total: result.totalKm, own: person.distanceKm }}
                  />
                ) : null}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                    <td className="pt-2">Summe</td>
                    <td className="pt-2 text-right">{formatCents(result.totalCents)}</td>
                    <td className="pt-2 text-right">{formatCents(person.owesCents)}</td>
                  </tr>
                </tfoot>
              </table>
              {usage.length > 0 ? (
                <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  Nutzungskosten werden nach dem Anteil an allen gefahrenen km verteilt:{' '}
                  {formatKm(person.distanceKm)} von {formatKm(result.totalKm)} (
                  {formatPercent(person.kmShare)}). Das entspricht{' '}
                  {formatEuroPerKm(result.totalKm > 0 ? kmCostCents / result.totalKm : null)}.
                  {stats.some((s) => s.carId !== null && s.centsPerKm !== null)
                    ? ` Je Auto: ${stats
                        .filter((s) => s.carId !== null && s.centsPerKm !== null)
                        .map((s) => `${carName(s.carId)} ${formatEuroPerKm(s.centsPerKm)}`)
                        .join(', ')}.`
                    : ''}
                </p>
              ) : null}
            </Card>
          )}

          <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Abstimmung</h2>
          <Card className="mb-3">
            <dl className="space-y-1.5 text-sm tabular-nums">
              <Line label="Anteil an den Kosten">{formatCents(person.owesCents)}</Line>
              <Line label="Selbst bezahlt">− {formatCents(person.paidCents)}</Line>
              {person.settledCents !== 0 ? (
                <Line
                  label={person.settledCents > 0 ? 'Ausgleich überwiesen' : 'Ausgleich erhalten'}
                >
                  {person.settledCents > 0 ? '− ' : '+ '}
                  {formatCents(Math.abs(person.settledCents))}
                </Line>
              ) : null}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
                <dt className="text-slate-700">Saldo</dt>
                <dd
                  className={
                    person.balanceCents === 0
                      ? 'text-slate-500'
                      : person.balanceCents > 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                  }
                >
                  {person.balanceCents === 0
                    ? 'ausgeglichen'
                    : person.balanceCents > 0
                      ? `bekommt ${formatCents(person.balanceCents)}`
                      : `zahlt ${formatCents(-person.balanceCents)}`}
                </dd>
              </div>
            </dl>
          </Card>

          {ownReceipts.length > 0 ? (
            <>
              <h2 className="mb-2 mt-4 text-sm font-semibold text-slate-700">
                Von {person.displayName} bezahlt
              </h2>
              <Card>
                <ul className="space-y-1.5 text-sm">
                  {ownReceipts.map(({ expense, accruedCents }) => (
                    <li key={expense.id} className="flex justify-between gap-2">
                      <span className="text-slate-700">
                        {formatDateISO(expense.incurredOn)} · {CATEGORY_LABELS[expense.category]}
                        {expense.carId ? ` · ${carName(expense.carId)}` : ''}
                        {accruedCents !== expense.amountCents ? (
                          <span className="block text-xs text-slate-500">
                            Beleg {formatCents(expense.amountCents)}, davon im Zeitraum
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-900">
                        {formatCents(accruedCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  )
}

function Section({
  title,
  rows,
  carName,
  km,
}: {
  title: string
  rows: BreakdownRow[]
  carName: (id: string | null) => string
  /** For km-based rows: the distances the share was computed from. */
  km?: { total: number; own: number }
}) {
  return (
    <tbody>
      <tr>
        <th
          colSpan={3}
          className="pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          {title}
        </th>
      </tr>
      {rows.map((row) => (
        <tr
          key={`${row.basis}-${row.category}-${row.carId}`}
          className="border-b border-slate-100 last:border-0"
        >
          <td className="py-1.5 pr-2 text-slate-700">
            {CATEGORY_LABELS[row.category]} · {carName(row.carId)}
            {row.partial || row.count > 1 ? (
              <span className="block text-xs text-slate-500">
                {[row.count > 1 ? `${row.count} Belege` : null, row.partial ? 'anteilig' : null]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            ) : null}
          </td>
          <td className="py-1.5 text-right align-top text-slate-700">
            {formatCents(row.totalCents)}
            {km ? <span className="block text-xs text-slate-500">{formatKm(km.total)}</span> : null}
          </td>
          <td className="py-1.5 text-right align-top font-medium text-slate-900">
            {formatCents(row.shareCents)}
            {km ? <span className="block text-xs text-slate-500">{formatKm(km.own)}</span> : null}
          </td>
        </tr>
      ))}
    </tbody>
  )
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  )
}
