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
import { AuditNote, PersonPicker, Sheet, joinNames } from '../components/Sheet'
import { useApp, useProfileLookup } from '../context/AppContext'
import { useLiveReload } from '../lib/useLiveReload'
import type { Trip, UUID } from '../data/types'
import { formatDateISO, monthRange, todayISO } from '../lib/dates'
import { formatKm } from '../lib/format'
import { kmByUser } from '../lib/settlement'
import MonthPicker from '../components/MonthPicker'

export default function TripsScreen() {
  const { provider, cars, profiles } = useApp()
  const lookup = useProfileLookup()

  const [month, setMonth] = useState(() => new Date())
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** `null` = closed, `'new'` = adding, otherwise the trip being edited. */
  const [editing, setEditing] = useState<Trip | 'new' | null>(null)

  const range = useMemo(() => monthRange(month.getFullYear(), month.getMonth()), [month])

  /** `quiet` keeps the list on screen during a live refresh. */
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      setError(null)
      try {
        setTrips(await provider.listTrips(range))
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

  useLiveReload(['trips'], () => void load(true))

  /** Kilometres per person for the visible month; shared trips are split. */
  const perPerson = useMemo(() => {
    const totals = kmByUser(trips)
    return profiles
      .map((p) => ({ profile: p, km: totals.get(p.id) ?? 0 }))
      .filter((entry) => entry.km > 0)
      .sort((a, b) => b.km - a.km)
  }, [trips, profiles])

  const totalKm = trips.reduce((sum, t) => sum + t.distanceKm, 0)

  return (
    <Screen
      title="Fahrten"
      action={
        <Button className="px-3" onClick={() => setEditing('new')}>
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
                const people = trip.participantIds.map((id) => lookup(id))
                const car = cars.find((c) => c.id === trip.carId)
                return (
                  <li key={trip.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(trip)}
                      className="block w-full text-left"
                    >
                      <Card>
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 flex shrink-0 -space-x-1">
                            {people.map((person, index) => (
                              <span
                                key={trip.participantIds[index]}
                                className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
                                style={{
                                  backgroundColor: person?.color ?? '#94a3b8',
                                }}
                              />
                            ))}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800">
                                {joinNames(people.map((p) => p?.displayName ?? 'Unbekannt'))}
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
        <TripDialog
          trip={editing === 'new' ? undefined : editing}
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

/** Adds a new trip, or edits one when `trip` is given. */
export function TripDialog({
  trip,
  onClose,
  onSaved,
}: {
  trip?: Trip
  onClose: () => void
  /** Something was saved, left or deleted; the caller should reload and close. */
  onSaved: () => void
}) {
  const { provider, cars, user, profiles } = useApp()
  const lookup = useProfileLookup()

  const [carId, setCarId] = useState(trip?.carId ?? cars[0]?.id ?? '')
  const [drivenOn, setDrivenOn] = useState(trip?.drivenOn ?? todayISO())
  const [participantIds, setParticipantIds] = useState<UUID[]>(
    trip?.participantIds ?? (user ? [user.id] : []),
  )
  const [odometerStart, setOdometerStart] = useState(trip ? String(trip.odometerStart) : '')
  const [odometerEnd, setOdometerEnd] = useState(trip ? String(trip.odometerEnd) : '')
  const [note, setNote] = useState(trip?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'leave' | 'delete' | null>(null)

  // Pre-fill the start from the last reading for this car, so a forgotten trip
  // shows up as a gap rather than quietly disappearing. Not when editing: the
  // stored readings are what is being corrected.
  useEffect(() => {
    if (trip || !carId) return
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
  }, [carId, provider, trip])

  // Active members to choose from, plus anyone already on the trip.
  const choices = profiles.filter((p) => p.active || participantIds.includes(p.id))

  const start = Number(odometerStart)
  const end = Number(odometerEnd)
  const distance =
    odometerStart !== '' &&
    odometerEnd !== '' &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end >= start
      ? end - start
      : null

  const changed = trip
    ? carId !== trip.carId ||
      drivenOn !== trip.drivenOn ||
      [...participantIds].sort().join() !== [...trip.participantIds].sort().join() ||
      odometerStart !== String(trip.odometerStart) ||
      odometerEnd !== String(trip.odometerEnd) ||
      note !== (trip.note ?? '')
    : odometerEnd !== '' || note !== ''

  const names = (ids: UUID[]) => joinNames(ids.map((id) => lookup(id)?.displayName ?? 'Unbekannt'))
  const amOnTrip = trip && user ? trip.participantIds.includes(user.id) : false

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    if (participantIds.length === 0) {
      setError('Bitte mindestens eine Person auswählen.')
      return
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      setError('Bitte ganze Kilometerstände eintragen.')
      return
    }
    if (end < start) {
      setError('Der Kilometerstand am Ende darf nicht kleiner sein als am Anfang.')
      return
    }

    const values = {
      carId,
      participantIds,
      drivenOn,
      odometerStart: start,
      odometerEnd: end,
      note: note.trim() || null,
    }

    setBusy('save')
    setError(null)
    const result = trip
      ? await provider.updateTrip(trip.id, values)
      : await provider.createTrip({ ...values, bookingId: null })
    setBusy(null)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  async function handleLeave() {
    if (!trip || !user) return
    const last = trip.participantIds.length === 1
    const question = last
      ? 'Du bist die letzte Person – die Fahrt wird gelöscht. Fortfahren?'
      : 'Dich aus dieser Fahrt austragen?'
    if (!confirm(question)) return

    setBusy('leave')
    setError(null)
    const result = await provider.leaveTrip(trip.id)
    setBusy(null)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  async function handleDelete() {
    if (!trip) return
    const question = `Fahrt von ${names(trip.participantIds)} (${formatKm(trip.distanceKm)}) für alle löschen?`
    if (!confirm(question)) return

    setBusy('delete')
    setError(null)
    const result = await provider.deleteTrip(trip.id)
    setBusy(null)

    if (result.ok) onSaved()
    else setError(result.message)
  }

  return (
    <Sheet title={trip ? 'Fahrt bearbeiten' : 'Fahrt eintragen'} dirty={changed} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Wer ist gefahren?</span>
          <PersonPicker
            people={choices}
            selected={participantIds}
            onChange={setParticipantIds}
            meId={user?.id}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Alle Ausgewählten sind gleichberechtigt, die km werden gleichmäßig geteilt.
          </span>
        </div>

        <Field label="Datum">
          <Input
            type="date"
            value={drivenOn}
            onChange={(e) => setDrivenOn(e.target.value)}
            required
          />
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
          Gefahren:{' '}
          <strong className="text-slate-900">{distance === null ? '–' : formatKm(distance)}</strong>
          {distance !== null && participantIds.length > 1 ? (
            <span className="text-slate-500">
              {' '}
              · je Person {formatKm(distance / participantIds.length)}
            </span>
          ) : null}
        </p>

        <Field label="Notiz" hint="Optional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>

        {trip ? (
          <>
            <Button type="submit" className="w-full" disabled={busy !== null || !changed}>
              {busy === 'save'
                ? 'Speichern …'
                : changed
                  ? 'Änderungen speichern'
                  : 'Keine Änderungen'}
            </Button>
            {amOnTrip ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void handleLeave()}
              >
                {busy === 'leave' ? 'Austragen …' : 'Mich austragen'}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="danger"
              className="w-full"
              disabled={busy !== null}
              onClick={() => void handleDelete()}
            >
              {busy === 'delete' ? 'Löschen …' : 'Fahrt für alle löschen'}
            </Button>
          </>
        ) : (
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" className="flex-1" disabled={busy !== null || !carId}>
              {busy === 'save' ? 'Speichern …' : 'Speichern'}
            </Button>
          </div>
        )}
      </form>

      {trip ? <AuditNote audit={trip} /> : null}
    </Sheet>
  )
}
