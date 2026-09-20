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
import MonthPicker from '../components/MonthPicker'
import { useApp, useProfileLookup } from '../context/AppContext'
import { CATEGORY_LABELS, type Expense, type ExpenseCategory } from '../data/types'
import { formatDateISO, monthRange, todayISO } from '../lib/dates'
import { formatCents, parseAmountToCents } from '../lib/format'

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
  const { provider, cars, user } = useApp()
  const lookup = useProfileLookup()

  const [month, setMonth] = useState(() => new Date())
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const range = useMemo(() => monthRange(month.getFullYear(), month.getMonth()), [month])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setExpenses(await provider.listExpenses(range))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [provider, range])

  useEffect(() => {
    void load()
  }, [load])

  const byCategory = useMemo(() => {
    const totals = new Map<ExpenseCategory, number>()
    for (const expense of expenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amountCents)
    }
    return CATEGORY_ORDER.filter((c) => totals.has(c)).map((c) => ({
      category: c,
      cents: totals.get(c)!,
    }))
  }, [expenses])

  const total = expenses.reduce((sum, e) => sum + e.amountCents, 0)

  async function handleDelete(expense: Expense) {
    if (!confirm('Kosten wirklich löschen?')) return
    const result = await provider.deleteExpense(expense.id)
    if (!result.ok) setError(result.message)
    else void load()
  }

  return (
    <Screen
      title="Kosten"
      action={
        <Button className="px-3" onClick={() => setAdding(true)}>
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
          {byCategory.length > 0 ? (
            <Card className="mb-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Summe</h2>
                <span className="text-sm font-semibold text-slate-900">{formatCents(total)}</span>
              </div>
              <ul className="space-y-1">
                {byCategory.map(({ category, cents }) => (
                  <li key={category} className="flex justify-between text-sm">
                    <span className="text-slate-600">{CATEGORY_LABELS[category]}</span>
                    <span className="tabular-nums text-slate-700">{formatCents(cents)}</span>
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
                              Zeitraum {formatDateISO(expense.periodStart)} –{' '}
                              {formatDateISO(expense.periodEnd)} · wird anteilig verteilt
                            </div>
                          ) : null}
                          {expense.note ? (
                            <div className="mt-0.5 text-xs text-slate-500">{expense.note}</div>
                          ) : null}
                        </div>
                        {expense.userId === user?.id ? (
                          <button
                            onClick={() => void handleDelete(expense)}
                            className="shrink-0 px-1 text-xs text-slate-400"
                            aria-label="Kosten löschen"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {adding ? (
        <ExpenseDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      ) : null}
    </Screen>
  )
}

function ExpenseDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { provider, cars, user } = useApp()

  const [category, setCategory] = useState<ExpenseCategory>('fuel')
  const [amount, setAmount] = useState('')
  const [incurredOn, setIncurredOn] = useState(todayISO())
  const [carId, setCarId] = useState(cars[0]?.id ?? '')
  const [liters, setLiters] = useState('')
  const [spread, setSpread] = useState(false)
  const [periodStart, setPeriodStart] = useState(todayISO())
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-12-31`
  })
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Yearly bills are the ones worth spreading, so suggest it automatically.
  useEffect(() => {
    setSpread(category === 'insurance' || category === 'tax')
  }, [category])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    const cents = parseAmountToCents(amount)
    if (cents === null || cents === 0) {
      setError('Bitte einen gültigen Betrag eintragen, z. B. 54,90.')
      return
    }
    if (spread && periodEnd < periodStart) {
      setError('Das Ende des Zeitraums darf nicht vor dem Beginn liegen.')
      return
    }

    setBusy(true)
    setError(null)
    const result = await provider.createExpense({
      carId: carId || null,
      userId: user.id,
      category,
      amountCents: cents,
      incurredOn,
      periodStart: spread ? periodStart : null,
      periodEnd: spread ? periodEnd : null,
      liters: category === 'fuel' && liters ? Number(liters.replace(',', '.')) : null,
      note: note.trim() || null,
      receiptPath: null,
    })
    setBusy(false)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-slate-900/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 safe-bottom sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">Kosten hinzufügen</h2>
        <ErrorBanner message={error} />

        <Field label="Art">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
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

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </div>
  )
}
