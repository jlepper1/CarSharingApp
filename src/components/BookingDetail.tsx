import { useState, type FormEvent } from 'react'
import { Button, ErrorBanner, Field, Input, Select } from './ui'
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Booking } from '../data/types'
import { formatLongDay, formatTime, toDateTimeLocal } from '../lib/dates'
import { formatDuration } from '../lib/format'

/**
 * One reservation, opened by tapping it anywhere in the app.
 *
 * Your own reservations open as a form so they can be corrected in place -
 * a wrong end time should not mean deleting and starting over. Other people's
 * are read-only, matching what the database policies allow anyway.
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
  const car = cars.find((c) => c.id === booking.carId)
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
    const label = booking.reference > 0 ? `Reservierung #${booking.reference}` : 'Diese Reservierung'
    if (!confirm(`${label} wirklich löschen?`)) return

    setBusy('delete')
    setError(null)
    const result = await provider.deleteBooking(booking.id)
    setBusy(null)

    if (result.ok) onChanged()
    else setError(result.message)
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-slate-900/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={
          booking.reference > 0 ? `Reservierung Nummer ${booking.reference}` : 'Reservierung'
        }
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 safe-bottom sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {booking.reference > 0 ? (
              <span className="text-xs font-medium tabular-nums text-slate-400">
                Reservierung #{booking.reference}
              </span>
            ) : null}
            <h2 className="text-lg font-semibold text-slate-900">
              {isMine ? 'Reservierung bearbeiten' : (car?.name ?? 'Reservierung')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="-mr-1 -mt-1 px-2 py-1 text-slate-400"
          >
            ✕
          </button>
        </div>

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

        {isMine ? (
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
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              <Row label="Auto">{car?.name ?? 'Auto'}</Row>
              <Row label="Von">
                {formatLongDay(new Date(booking.startsAt))},{' '}
                {formatTime(new Date(booking.startsAt))} Uhr
              </Row>
              <Row label="Bis">
                {formatLongDay(new Date(booking.endsAt))}, {formatTime(new Date(booking.endsAt))} Uhr
              </Row>
              <Row label="Dauer">{formatDuration(booking.startsAt, booking.endsAt)}</Row>
              {booking.purpose ? <Row label="Zweck">{booking.purpose}</Row> : null}
            </dl>
            <p className="mt-4 text-center text-xs text-slate-500">
              Nur {person?.displayName ?? 'die Person'} kann diese Reservierung ändern.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  )
}
