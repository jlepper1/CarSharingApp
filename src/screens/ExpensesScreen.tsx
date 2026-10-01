import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Screen,
  Select,
  Spinner,
} from '../components/ui'
import { AuditNote, Sheet } from '../components/Sheet'
import MonthPicker from '../components/MonthPicker'
import { useApp, useProfileLookup } from '../context/AppContext'
import { useLiveReload } from '../lib/useLiveReload'
import { CATEGORY_LABELS, type Expense, type ExpenseCategory } from '../data/types'
import { formatDateISO, formatMonth, formatPeriod, monthRange, todayISO } from '../lib/dates'
import { formatCents, parseAmountToCents } from '../lib/format'
import { accruedCents, costSummary } from '../lib/settlement'

const CATEGORY_ORDER: ExpenseCategory[] = [
  'fuel',
  'insurance',
  'tax',
  'repair',
  'service',
  'tires',
  'other',
]

export default function ExpensesScreen() {
  const { provider, cars } = useApp()
  const lookup = useProfileLookup()

  const [month, setMonth] = useState(() => new Date())
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** `null` = closed, `'new'` = adding, otherwise the expense being edited. */
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)

  const range = useMemo(() => monthRange(month.getFullYear(), month.getMonth()), [month])

  /** `quiet` keeps the list on screen during a live refresh. */
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      setError(null)
      try {
        setExpenses(await provider.listExpenses(range))
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

  useLiveReload(['expenses'], () => void load(true))

  const summary = useMemo(() => costSummary(expenses, range), [expenses, range])
  const total = summary.reduce((sum, row) => sum + row.cents, 0)

  return (
    <Screen
      title="Kosten"
      action={
        <Button className="px-3" onClick={() => setEditing('new')}>
          + Kosten
        </Button>
      }
    >
      <ErrorBanner message={error} />
      <MonthPicker month={month} onChange={setMonth} />

      {loading ? (
        <Spinner />
      ) : (
        <>
          {summary.length > 0 ? (
            <Card className="mb-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Summe</h2>
                <span className="text-sm font-semibold text-slate-900">{formatCents(total)}</span>
              </div>
              <ul className="space-y-1">
                {summary.map(({ category, period, cents }, index) => (
                  <li key={index} className="flex justify-between gap-2 text-sm">
                    <span className="text-slate-600">
                      {CATEGORY_LABELS[category]}
                      {period ? (
                        <span className="text-slate-400">
                          {' '}
                          ({formatPeriod(period.start, period.end)})
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700">
                      {formatCents(cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {expenses.length === 0 ? (
            <EmptyState>
              Noch keine Kosten in diesem Monat.
              <br />
              Tanken, Versicherung, Steuer und Reparaturen kommen hier hinein.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {expenses.map((expense) => {
                const person = lookup(expense.userId)
                const car = cars.find((c) => c.id === expense.carId)
                return (
                  <li key={expense.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(expense)}
                      className="block w-full text-left"
                    >
                      <Card>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800">
                                {CATEGORY_LABELS[expense.category]}
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                                {formatCents(expense.amountCents)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatDateISO(expense.incurredOn)} · bezahlt von{' '}
                              {person?.displayName ?? 'Unbekannt'}
                              {car ? ` · ${car.name}` : ''}
                              {expense.liters ? ` · ${expense.liters} l` : ''}
                            </div>
                            {expense.periodStart && expense.periodEnd ? (
                              <div className="mt-0.5 text-xs text-brand-700">
                                Zeitraum {formatPeriod(expense.periodStart, expense.periodEnd)} ·
                                Anteil {formatMonth(month)}:{' '}
                                {formatCents(accruedCents(expense, range))}
                              </div>
                            ) : null}
                            {expense.note ? (
                              <div className="mt-0.5 text-xs text-slate-500">{expense.note}</div>
                            ) : null}
                          </div>
                          <span aria-hidden className="shrink-0 self-center text-slate-300">
                            ›
                          </span>
                        </div>
                      </Card>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {editing ? (
        <ExpenseDialog
          expense={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}
    </Screen>
  )
}

/** Yearly bills are the ones worth spreading over their period. */
function suggestsSpread(category: ExpenseCategory): boolean {
  return category === 'insurance' || category === 'tax'
}

/** Adds a cost, or edits one when `expense` is given. */
export function ExpenseDialog({
  expense,
  onClose,
  onSaved,
}: {
  expense?: Expense
  onClose: () => void
  /** Something was saved or deleted; the caller should reload and close. */
  onSaved: () => void
}) {
  const { provider, cars, user, profiles } = useApp()
  const lookup = useProfileLookup()

  const initial = {
    category: expense?.category ?? ('fuel' as ExpenseCategory),
    payerId: expense?.userId ?? user?.id ?? '',
    amount: expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : '',
    incurredOn: expense?.incurredOn ?? todayISO(),
    carId: expense ? (expense.carId ?? '') : (cars[0]?.id ?? ''),
    liters: expense?.liters ? String(expense.liters).replace('.', ',') : '',
    spread: expense ? expense.periodStart !== null : suggestsSpread('fuel'),
    periodStart: expense?.periodStart ?? todayISO(),
    periodEnd: expense?.periodEnd ?? `${new Date().getFullYear()}-12-31`,
    note: expense?.note ?? '',
  }

  const [category, setCategory] = useState(initial.category)
  const [payerId, setPayerId] = useState(initial.payerId)
  const [amount, setAmount] = useState(initial.amount)
  const [incurredOn, setIncurredOn] = useState(initial.incurredOn)
  const [carId, setCarId] = useState(initial.carId)
  const [liters, setLiters] = useState(initial.liters)
  const [spread, setSpread] = useState(initial.spread)
  const [periodStart, setPeriodStart] = useState(initial.periodStart)
  const [periodEnd, setPeriodEnd] = useState(initial.periodEnd)
  const [note, setNote] = useState(initial.note)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)

  /**
   * Picking a category suggests spreading for yearly bills. Done here rather
   * than in an effect, so opening a saved cost keeps its own setting.
   */
  function handleCategoryChange(next: ExpenseCategory) {
    setCategory(next)
    setSpread(suggestsSpread(next))
  }

  const changed =
    category !== initial.category ||
    payerId !== initial.payerId ||
    amount !== initial.amount ||
    incurredOn !== initial.incurredOn ||
    carId !== initial.carId ||
    liters !== initial.liters ||
    spread !== initial.spread ||
    (spread && (periodStart !== initial.periodStart || periodEnd !== initial.periodEnd)) ||
    note !== initial.note

  // Active members to choose from, plus whoever paid an older entry.
  const payers = profiles.filter((p) => p.active || p.id === payerId)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user || !payerId) return

    const cents = parseAmountToCents(amount)
    if (cents === null || cents === 0) {
      setError('Bitte einen gültigen Betrag eintragen, z. B. 54,90.')
      return
    }
    if (spread && periodEnd < periodStart) {
      setError('Das Ende des Zeitraums darf nicht vor dem Beginn liegen.')
      return
    }

    const values = {
      carId: carId || null,
      userId: payerId,
      category,
      amountCents: cents,
      incurredOn,
      periodStart: spread ? periodStart : null,
      periodEnd: spread ? periodEnd : null,
      liters: category === 'fuel' && liters ? Number(liters.replace(',', '.')) : null,
      note: note.trim() || null,
    }

    setBusy('save')
    setError(null)
    const result = expense
      ? await provider.updateExpense(expense.id, values)
      : await provider.createExpense({ ...values, receiptPath: null })
    setBusy(null)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  async function handleDelete() {
    if (!expense) return
    const payer = lookup(expense.userId)?.displayName ?? 'Unbekannt'
    const question = `${CATEGORY_LABELS[expense.category]} über ${formatCents(expense.amountCents)}, bezahlt von ${payer}, für alle löschen?`
    if (!confirm(question)) return

    setBusy('delete')
    setError(null)
    const result = await provider.deleteExpense(expense.id)
    setBusy(null)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  return (
    <Sheet
      title={expense ? 'Kosten bearbeiten' : 'Kosten hinzufügen'}
      dirty={changed}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorBanner message={error} />

        <Field label="Art">
          <Select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as ExpenseCategory)}
            required
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Betrag (€)">
            <Input
              inputMode="decimal"
              placeholder="54,90"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Datum">
            <Input
              type="date"
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Bezahlt von">
          <Select value={payerId} onChange={(e) => setPayerId(e.target.value)} required>
            {payers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
                {p.id === user?.id ? ' (du)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Auto">
          <Select value={carId} onChange={(e) => setCarId(e.target.value)}>
            <option value="">Kein bestimmtes Auto</option>
            {cars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </Select>
        </Field>

        {category === 'fuel' ? (
          <Field label="Liter" hint="Optional, für den Verbrauch">
            <Input
              inputMode="decimal"
              placeholder="42,5"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
            />
          </Field>
        ) : null}

        <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={spread}
            onChange={(e) => setSpread(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm text-slate-700">
            Über einen Zeitraum verteilen
            <span className="mt-0.5 block text-xs text-slate-500">
              Für Jahresbeiträge wie Versicherung oder Steuer. Die Kosten werden dann taggenau auf
              die Monate verteilt statt komplett in einem Monat zu erscheinen.
            </span>
          </span>
        </label>

        {spread ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zeitraum von">
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </Field>
            <Field label="Zeitraum bis">
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </Field>
          </div>
        ) : null}

        <Field label="Notiz" hint="Optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>

        {expense ? (
          <>
            <Button type="submit" className="w-full" disabled={busy !== null || !changed}>
              {busy === 'save'
                ? 'Speichern …'
                : changed
                  ? 'Änderungen speichern'
                  : 'Keine Änderungen'}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full"
              disabled={busy !== null}
              onClick={() => void handleDelete()}
            >
              {busy === 'delete' ? 'Löschen …' : 'Kosten für alle löschen'}
            </Button>
          </>
        ) : (
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" className="flex-1" disabled={busy !== null}>
              {busy === 'save' ? 'Speichern …' : 'Speichern'}
            </Button>
          </div>
        )}
      </form>

      {expense ? <AuditNote audit={expense} /> : null}
    </Sheet>
  )
}
