import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Screen,
  Select,
  Spinner,
} from '../components/ui'
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Booking } from '../data/types'
import {
  addDays,
  formatDay,
  formatTime,
  overlapsDay,
  startOfWeek,
  toDateTimeLocal,
  toISODate,
  weekDays,
  weekRange,
} from '../lib/dates'

export default function CalendarScreen() {
  const { provider, cars, user } = useApp()
  const lookup = useProfileLookup()

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [carFilter, setCarFilter] = useState<string>('all')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftDay, setDraftDay] = useState<Date | null>(null)

  const range = useMemo(() => weekRange(weekStart), [weekStart])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBookings(await provider.listBookings(range))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [provider, range])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => (carFilter === 'all' ? bookings : bookings.filter((b) => b.carId === carFilter)),
    [bookings, carFilter],
  )

  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const today = toISODate(new Date())

  async function handleDelete(booking: Booking) {
    if (!confirm('Reservierung wirklich löschen?')) return
    const result = await provider.deleteBooking(booking.id)
    if (!result.ok) setError(result.message)
    else void load()
  }

  return (
    <Screen
      title="Kalender"
      action={
        <Button onClick={() => setDraftDay(new Date())} className="px-3">
          + Reservieren
        </Button>
      }
    >
      <ErrorBanner message={error} />

      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" className="px-3" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ‹
        </Button>
        <div className="flex-1 text-center text-sm font-medium text-slate-700">
          {formatDay(days[0])} – {formatDay(days[6])}
        </div>
        <Button variant="secondary" className="px-3" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          ›
        </Button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={carFilter === 'all'} onClick={() => setCarFilter('all')}>
          Alle Autos
        </FilterChip>
        {cars.map((car) => (
          <FilterChip key={car.id} active={carFilter === car.id} onClick={() => setCarFilter(car.id)}>
            {car.name}
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const dayBookings = visible.filter((b) => overlapsDay(b.startsAt, b.endsAt, day))
            const isToday = toISODate(day) === today
            return (
              <Card key={day.toISOString()} className={isToday ? 'border-brand-600' : ''}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`text-sm font-semibold ${isToday ? 'text-brand-700' : 'text-slate-700'}`}>
                    {formatDay(day)}
                    {isToday ? ' · heute' : ''}
                  </span>
                  <button
                    onClick={() => setDraftDay(day)}
                    className="text-xs font-medium text-brand-700"
                  >
                    + Reservieren
                  </button>
                </div>

                {dayBookings.length === 0 ? (
                  <p className="text-sm text-slate-400">Frei</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayBookings.map((booking) => {
                      const person = lookup(booking.userId)
                      const car = cars.find((c) => c.id === booking.carId)
                      return (
                        <li
                          key={booking.id}
                          className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2"
                        >
                          <span
                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: person?.color ?? '#94a3b8' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800">
                              {person?.displayName ?? 'Unbekannt'} · {car?.name ?? 'Auto'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatTime(new Date(booking.startsAt))} –{' '}
                              {formatTime(new Date(booking.endsAt))}
                              {booking.purpose ? ` · ${booking.purpose}` : ''}
                            </div>
                          </div>
                          {booking.userId === user?.id ? (
                            <button
                              onClick={() => void handleDelete(booking)}
                              className="shrink-0 px-1 text-xs text-slate-400"
                              aria-label="Reservierung löschen"
                            >
                              ✕
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {draftDay ? (
        <BookingDialog
          day={draftDay}
          onClose={() => setDraftDay(null)}
          onSaved={() => {
            setDraftDay(null)
            void load()
          }}
        />
      ) : null}
    </Screen>
  )
}

function FilterChip({
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
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 border border-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function BookingDialog({
  day,
  onClose,
  onSaved,
}: {
  day: Date
  onClose: () => void
  onSaved: () => void
}) {
  const { provider, cars, user } = useApp()

  const defaults = useMemo(() => {
    const start = new Date(day)
    start.setHours(9, 0, 0, 0)
    const end = new Date(day)
    end.setHours(17, 0, 0, 0)
    return { start: toDateTimeLocal(start), end: toDateTimeLocal(end) }
  }, [day])

  const [carId, setCarId] = useState(cars[0]?.id ?? '')
  const [startsAt, setStartsAt] = useState(defaults.start)
  const [endsAt, setEndsAt] = useState(defaults.end)
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    const start = new Date(startsAt)
    const end = new Date(endsAt)
    if (end <= start) {
      setError('Das Ende muss nach dem Beginn liegen.')
      return
    }

    setBusy(true)
    setError(null)
    const result = await provider.createBooking({
      carId,
      userId: user.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      purpose: purpose.trim() || null,
    })
    setBusy(false)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 safe-bottom sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">Auto reservieren</h2>
        <ErrorBanner message={error} />

        {cars.length === 0 ? (
          <p className="text-sm text-slate-600">
            Noch kein Auto angelegt. Das geht unter „Mehr“.
          </p>
        ) : (
          <>
            <Field label="Auto">
              <Select value={carId} onChange={(e) => setCarId(e.target.value)} required>
                {cars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Von">
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </Field>

            <Field label="Bis">
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </Field>

            <Field label="Zweck" hint="Optional, z. B. Einkaufen oder Arbeit">
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={80} />
            </Field>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || cars.length === 0}>
            {busy ? 'Speichern …' : 'Reservieren'}
          </Button>
        </div>
      </form>
    </div>
  )
}
