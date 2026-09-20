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
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Trip } from '../data/types'
import { formatDateISO, monthRange, todayISO } from '../lib/dates'
import { formatKm } from '../lib/format'
import MonthPicker from '../components/MonthPicker'

export default function TripsScreen() {
  const { provider, cars, user, profiles } = useApp()
  const lookup = useProfileLookup()

  const [month, setMonth] = useState(() => new Date())
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const range = useMemo(() => monthRange(month.getFullYear(), month.getMonth()), [month])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTrips(await provider.listTrips(range))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [provider, range])

  useEffect(() => {
    void load()
  }, [load])

  /** Kilometres per person for the visible month. */
  const perPerson = useMemo(() => {
    const totals = new Map<string, number>()
    for (const trip of trips) {
      totals.set(trip.userId, (totals.get(trip.userId) ?? 0) + trip.distanceKm)
    }
    return profiles
      .map((p) => ({ profile: p, km: totals.get(p.id) ?? 0 }))
      .filter((entry) => entry.km > 0)
      .sort((a, b) => b.km - a.km)
  }, [trips, profiles])

  const totalKm = trips.reduce((sum, t) => sum + t.distanceKm, 0)

  async function handleDelete(trip: Trip) {
    if (!confirm('Fahrt wirklich löschen?')) return
    const result = await provider.deleteTrip(trip.id)
    if (!result.ok) setError(result.message)
    else void load()
  }

  return (
    <Screen
      title="Fahrten"
      action={
        <Button className="px-3" onClick={() => setAdding(true)}>
          + Fahrt
        </Button>
      }
    >
      <ErrorBanner message={error} />
      <MonthPicker month={month} onChange={setMonth} />

      {loading ? (
        <Spinner />
      ) : (
        <>
          {perPerson.length > 0 ? (
            <Card className="mb-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Kilometer im Monat</h2>
                <span className="text-sm font-semibold text-slate-900">{formatKm(totalKm)}</span>
              </div>
              <ul className="space-y-1.5">
                {perPerson.map(({ profile, km }) => (
                  <li key={profile.id} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: profile.color }}
                    />
                    <span className="flex-1 text-slate-700">{profile.displayName}</span>
                    <span className="tabular-nums text-slate-600">{formatKm(km)}</span>
                    <span className="w-12 text-right tabular-nums text-xs text-slate-400">
                      {totalKm > 0 ? `${Math.round((km / totalKm) * 100)} %` : '–'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {trips.length === 0 ? (
            <EmptyState>
              Noch keine Fahrten in diesem Monat.
              <br />
              Trage nach dem Fahren den Kilometerstand ein.
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {trips.map((trip) => {
                const person = lookup(trip.userId)
                const car = cars.find((c) => c.id === trip.carId)
                return (
                  <li key={trip.id}>
                    <Card>
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: person?.color ?? '#94a3b8' }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-slate-800">
                              {person?.displayName ?? 'Unbekannt'}
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                              {formatKm(trip.distanceKm)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDateISO(trip.drivenOn)} · {car?.name ?? 'Auto'} ·{' '}
                            {trip.odometerStart.toLocaleString('de-DE')} →{' '}
                            {trip.odometerEnd.toLocaleString('de-DE')}
                          </div>
                          {trip.note ? (
                            <div className="mt-0.5 text-xs text-slate-500">{trip.note}</div>
                          ) : null}
                        </div>
                        {trip.userId === user?.id ? (
                          <button
                            onClick={() => void handleDelete(trip)}
                            className="shrink-0 px-1 text-xs text-slate-400"
                            aria-label="Fahrt löschen"
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
        <TripDialog
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

function TripDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { provider, cars, user } = useApp()

  const [carId, setCarId] = useState(cars[0]?.id ?? '')
  const [drivenOn, setDrivenOn] = useState(todayISO())
  const [odometerStart, setOdometerStart] = useState('')
  const [odometerEnd, setOdometerEnd] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Pre-fill the start from the last reading for this car, so a forgotten trip
  // shows up as a gap rather than quietly disappearing.
  useEffect(() => {
    if (!carId) return
    let active = true
    provider
      .getLastOdometer(carId)
      .then((last) => {
        if (active) setOdometerStart(String(last))
      })
      .catch(() => {
        /* leave the field empty and let the driver type it */
      })
    return () => {
      active = false
    }
  }, [carId, provider])

  const start = Number(odometerStart)
  const end = Number(odometerEnd)
  const distance = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      setError('Bitte ganze Kilometerstände eintragen.')
      return
    }
    if (end < start) {
      setError('Der Kilometerstand am Ende darf nicht kleiner sein als am Anfang.')
      return
    }

    setBusy(true)
    setError(null)
    const result = await provider.createTrip({
      carId,
      userId: user.id,
      bookingId: null,
      drivenOn,
      odometerStart: start,
      odometerEnd: end,
      note: note.trim() || null,
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
        <h2 className="text-lg font-semibold text-slate-900">Fahrt eintragen</h2>
        <ErrorBanner message={error} />

        <Field label="Auto">
          <Select value={carId} onChange={(e) => setCarId(e.target.value)} required>
            {cars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Datum">
          <Input type="date" value={drivenOn} onChange={(e) => setDrivenOn(e.target.value)} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="km-Stand Start">
            <Input
              type="number"
              inputMode="numeric"
              value={odometerStart}
              onChange={(e) => setOdometerStart(e.target.value)}
              required
            />
          </Field>
          <Field label="km-Stand Ende">
            <Input
              type="number"
              inputMode="numeric"
              value={odometerEnd}
              onChange={(e) => setOdometerEnd(e.target.value)}
              required
            />
          </Field>
        </div>

        <p className="text-sm text-slate-600">
          Gefahren: <strong className="text-slate-900">{distance === null ? '–' : formatKm(distance)}</strong>
        </p>

        <Field label="Notiz" hint="Optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !carId}>
            {busy ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </div>
  )
}
