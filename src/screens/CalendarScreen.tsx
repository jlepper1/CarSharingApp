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
import BookingDetail from '../components/BookingDetail'
import MonthGrid from '../components/MonthGrid'
import MonthPicker from '../components/MonthPicker'
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Booking } from '../data/types'
import {
  daySegment,
  formatDay,
  formatLongDay,
  formatTime,
  monthGridDays,
  overlapsDay,
  toDateTimeLocal,
  toISODate,
} from '../lib/dates'

type View = 'month' | 'list'

export default function CalendarScreen() {
  const { provider, cars } = useApp()
  const lookup = useProfileLookup()

  const [view, setView] = useState<View>('month')
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [showPast, setShowPast] = useState(false)
  const [carFilter, setCarFilter] = useState<string>('all')

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Booking | null>(null)
  const [draftDay, setDraftDay] = useState<Date | null>(null)

  // The month view fetches exactly the grid it draws. The list is meant to save
  // people from paging through months, so it fetches a wide window once and
  // splits it in the browser.
  const range = useMemo(() => {
    if (view === 'month') {
      const days = monthGridDays(month)
      return { from: toISODate(days[0]), to: toISODate(days[days.length - 1]) }
    }
    const now = new Date()
    return {
      from: toISODate(new Date(now.getFullYear() - 2, 0, 1)),
      to: toISODate(new Date(now.getFullYear() + 2, 11, 31)),
    }
  }, [view, month])

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

  const colorOf = useCallback(
    (userId: string) => lookup(userId)?.color ?? '#94a3b8',
    [lookup],
  )

  async function handleDelete(booking: Booking) {
    const label = booking.reference > 0 ? `Reservierung #${booking.reference}` : "Diese Reservierung"
    if (!confirm(`${label} wirklich löschen?`)) return
    const result = await provider.deleteBooking(booking.id)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setDetail(null)
    void load()
  }

  return (
    <Screen
      title="Kalender"
      action={
        <Button onClick={() => setDraftDay(selectedDay)} className="px-3">
          + Reservieren
        </Button>
      }
    >
      <ErrorBanner message={error} />

      <div className="mb-3 flex gap-2">
        <ViewTab active={view === 'month'} onClick={() => setView('month')}>
          Monat
        </ViewTab>
        <ViewTab active={view === 'list'} onClick={() => setView('list')}>
          Liste
        </ViewTab>
      </div>

      {cars.length > 1 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={carFilter === 'all'} onClick={() => setCarFilter('all')}>
            Alle Autos
          </FilterChip>
          {cars.map((car) => (
            <FilterChip
              key={car.id}
              active={carFilter === car.id}
              onClick={() => setCarFilter(car.id)}
            >
              {car.name}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {view === 'month' ? (
        <MonthView
          month={month}
          onMonthChange={setMonth}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          bookings={visible}
          loading={loading}
          colorOf={colorOf}
          onOpen={setDetail}
          onReserve={() => setDraftDay(selectedDay)}
        />
      ) : (
        <ListView
          bookings={visible}
          loading={loading}
          showPast={showPast}
          onTogglePast={setShowPast}
          onOpen={setDetail}
        />
      )}

      {detail ? (
        <BookingDetail
          booking={detail}
          error={null}
          onDelete={(b) => void handleDelete(b)}
          onClose={() => setDetail(null)}
        />
      ) : null}

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

function MonthView({
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
  bookings,
  loading,
  colorOf,
  onOpen,
  onReserve,
}: {
  month: Date
  onMonthChange: (d: Date) => void
  selectedDay: Date
  onSelectDay: (d: Date) => void
  bookings: Booking[]
  loading: boolean
  colorOf: (userId: string) => string
  onOpen: (b: Booking) => void
  onReserve: () => void
}) {
  const { cars } = useApp()
  const lookup = useProfileLookup()

  const dayBookings = bookings.filter((b) => overlapsDay(b.startsAt, b.endsAt, selectedDay))

  return (
    <>
      <MonthPicker month={month} onChange={onMonthChange} />

      {loading ? (
        <Spinner />
      ) : (
        <Card className="mb-3">
          <MonthGrid
            month={month}
            bookings={bookings}
            selected={selectedDay}
            onSelect={onSelectDay}
            colorOf={colorOf}
          />
        </Card>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{formatLongDay(selectedDay)}</h2>
        <button onClick={onReserve} className="text-xs font-medium text-brand-700">
          + Reservieren
        </button>
      </div>

      {dayBookings.length === 0 ? (
        <EmptyState>An diesem Tag ist kein Auto reserviert.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {dayBookings.map((booking) => {
            const person = lookup(booking.userId)
            const car = cars.find((c) => c.id === booking.carId)
            return (
              <li key={booking.id}>
                <button
                  onClick={() => onOpen(booking)}
                  className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left active:bg-slate-50"
                >
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: person?.color ?? '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">
                      {person?.displayName ?? 'Unbekannt'} · {car?.name ?? 'Auto'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {daySegment(booking.startsAt, booking.endsAt, selectedDay).label}
                      {booking.purpose ? ` · ${booking.purpose}` : ''}
                    </span>
                  </span>
                  {booking.reference > 0 ? (
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      #{booking.reference}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function ListView({
  bookings,
  loading,
  showPast,
  onTogglePast,
  onOpen,
}: {
  bookings: Booking[]
  loading: boolean
  showPast: boolean
  onTogglePast: (v: boolean) => void
  onOpen: (b: Booking) => void
}) {
  const { cars } = useApp()
  const lookup = useProfileLookup()

  // A reservation counts as current until it ends, so one running right now
  // stays under "Kommende" rather than disappearing into the past.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const upcoming: Booking[] = []
    const past: Booking[] = []
    for (const booking of bookings) {
      if (new Date(booking.endsAt).getTime() >= now) upcoming.push(booking)
      else past.push(booking)
    }
    upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    past.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    return { upcoming, past }
  }, [bookings])

  const shown = showPast ? past : upcoming

  return (
    <>
      <div className="mb-3 flex gap-2">
        <ViewTab active={!showPast} onClick={() => onTogglePast(false)}>
          Kommende ({upcoming.length})
        </ViewTab>
        <ViewTab active={showPast} onClick={() => onTogglePast(true)}>
          Vergangene ({past.length})
        </ViewTab>
      </div>

      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState>
          {showPast ? 'Noch keine vergangenen Reservierungen.' : 'Keine kommenden Reservierungen.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {shown.map((booking) => {
            const person = lookup(booking.userId)
            const car = cars.find((c) => c.id === booking.carId)
            const start = new Date(booking.startsAt)
            const end = new Date(booking.endsAt)
            const sameDay = toISODate(start) === toISODate(end)

            return (
              <li key={booking.id}>
                <button
                  onClick={() => onOpen(booking)}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left active:bg-slate-50"
                >
                  {booking.reference > 0 ? (
                    <span className="mt-0.5 shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-500">
                      #{booking.reference}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">
                      {sameDay
                        ? `${formatDay(start)}, ${formatTime(start)} – ${formatTime(end)}`
                        : `${formatDay(start)}, ${formatTime(start)} – ${formatDay(end)}, ${formatTime(end)}`}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: person?.color ?? '#94a3b8' }}
                      />
                      {person?.displayName ?? 'Unbekannt'} · {car?.name ?? 'Auto'}
                      {booking.purpose ? ` · ${booking.purpose}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function ViewTab({
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
        active ? 'bg-brand-700 text-white' : 'border border-slate-300 bg-white text-slate-600'
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
    <div className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-slate-900/40 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 safe-bottom sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">Auto reservieren</h2>
        <ErrorBanner message={error} />

        {cars.length === 0 ? (
          <p className="text-sm text-slate-600">Noch kein Auto angelegt. Das geht unter „Mehr“.</p>
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
