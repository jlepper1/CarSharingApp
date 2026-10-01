import { useState, type FormEvent } from 'react'
import { Button, ErrorBanner, Field, Input, Select } from './ui'
import { AuditNote, Sheet } from './Sheet'
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Booking } from '../data/types'
import { endFollowingStart, toDateTimeLocal } from '../lib/dates'
import { formatDuration } from '../lib/format'

/**
 * One reservation, opened by tapping it anywhere in the app.
 *
 * It always opens as a form: the family looks after the calendar together, so
 * anyone may correct or remove any reservation. Who entered and who last
 * changed it is shown at the bottom instead.
 */
export default function BookingDetail({
  booking,
  onClose,
  onChanged,
}: {
  booking: Booking
  onClose: () => void
  /** Something was saved or deleted; the caller should reload and close. */
  onChanged: () => void
}) {
  const { provider, cars, user } = useApp()
  const lookup = useProfileLookup()

  const person = lookup(booking.userId)
  const isMine = booking.userId === user?.id

  const [carId, setCarId] = useState(booking.carId)
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(new Date(booking.startsAt)))
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(new Date(booking.endsAt)))
  const [purpose, setPurpose] = useState(booking.purpose ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)

  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const validRange = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start

  const changed =
    carId !== booking.carId ||
    startsAt !== toDateTimeLocal(new Date(booking.startsAt)) ||
    endsAt !== toDateTimeLocal(new Date(booking.endsAt)) ||
    purpose !== (booking.purpose ?? '')

  /** Changing the start moves the end with it, so only one field needs typing. */
  function handleStartChange(value: string) {
    setEndsAt((currentEnd) => endFollowingStart(startsAt, value, currentEnd))
    setStartsAt(value)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!validRange) {
      setError('Das Ende muss nach dem Beginn liegen.')
      return
    }

    setBusy('save')
    setError(null)
    const result = await provider.updateBooking(booking.id, {
      carId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      purpose: purpose.trim() || null,
    })
    setBusy(null)

    if (result.ok) onChanged()
    else setError(result.message)
  }

  async function handleDelete() {
    const label =
      booking.reference > 0 ? `Reservierung #${booking.reference}` : 'Diese Reservierung'
    const owner = isMine ? '' : ` von ${person?.displayName ?? 'Unbekannt'}`
    if (!confirm(`${label}${owner} wirklich löschen?`)) return

    setBusy('delete')
    setError(null)
    const result = await provider.deleteBooking(booking.id)
    setBusy(null)

    if (result.ok) onChanged()
    else setError(result.message)
  }

  return (
    <Sheet
      title="Reservierung bearbeiten"
      kicker={booking.reference > 0 ? `Reservierung #${booking.reference}` : undefined}
      label={booking.reference > 0 ? `Reservierung Nummer ${booking.reference}` : 'Reservierung'}
      dirty={changed}
      onClose={onClose}
    >
      <ErrorBanner message={error} />

      <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: person?.color ?? '#94a3b8' }}
        />
        <span className="text-sm text-slate-700">
          {person?.displayName ?? 'Unbekannt'}
          {isMine ? ' (du)' : ''}
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Field label="Auto">
          <Select value={carId} onChange={(e) => setCarId(e.target.value)} required>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Von">
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => handleStartChange(e.target.value)}
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

        <p className="text-sm text-slate-600">
          Dauer:{' '}
          <strong className="text-slate-900">
            {validRange ? formatDuration(start.toISOString(), end.toISOString()) : '–'}
          </strong>
        </p>

        <Field label="Zweck" hint="Optional, z. B. Einkaufen oder Arbeit">
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={80} />
        </Field>

        <Button type="submit" className="w-full" disabled={busy !== null || !changed}>
          {busy === 'save' ? 'Speichern …' : changed ? 'Änderungen speichern' : 'Keine Änderungen'}
        </Button>

        <Button
          type="button"
          variant="danger"
          className="w-full"
          disabled={busy !== null}
          onClick={() => void handleDelete()}
        >
          {busy === 'delete' ? 'Löschen …' : 'Reservierung löschen'}
        </Button>
      </form>

      <AuditNote audit={booking} />
    </Sheet>
  )
}
