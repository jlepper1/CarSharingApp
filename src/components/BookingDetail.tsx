import { Button, ErrorBanner } from './ui'
import { useApp, useProfileLookup } from '../context/AppContext'
import type { Booking } from '../data/types'
import { formatLongDay, formatTime } from '../lib/dates'
import { formatDuration } from '../lib/format'

/** Everything about one reservation, opened by tapping it anywhere in the app. */
export default function BookingDetail({
  booking,
  error,
  onDelete,
  onClose,
}: {
  booking: Booking
  error: string | null
  onDelete: (booking: Booking) => void
  onClose: () => void
}) {
  const { cars, user } = useApp()
  const lookup = useProfileLookup()

  const person = lookup(booking.userId)
  const car = cars.find((c) => c.id === booking.carId)
  const start = new Date(booking.startsAt)
  const end = new Date(booking.endsAt)
  const isMine = booking.userId === user?.id

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center overflow-y-auto bg-slate-900/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Reservierung Nummer ${booking.reference}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 safe-bottom sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {booking.reference > 0 ? (
              <span className="text-xs font-medium tabular-nums text-slate-400">
                Reservierung #{booking.reference}
              </span>
            ) : null}
            <h2 className="text-lg font-semibold text-slate-900">
              {car?.name ?? 'Auto'}
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

        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: person?.color ?? '#94a3b8' }}
          />
          <span className="text-sm text-slate-700">
            {person?.displayName ?? 'Unbekannt'}
            {isMine ? ' (du)' : ''}
          </span>
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="Von">
            {formatLongDay(start)}, {formatTime(start)} Uhr
          </Row>
          <Row label="Bis">
            {formatLongDay(end)}, {formatTime(end)} Uhr
          </Row>
          <Row label="Dauer">{formatDuration(booking.startsAt, booking.endsAt)}</Row>
          {booking.purpose ? <Row label="Zweck">{booking.purpose}</Row> : null}
        </dl>

        {isMine ? (
          <Button variant="danger" className="w-full" onClick={() => onDelete(booking)}>
            Reservierung löschen
          </Button>
        ) : (
          <p className="text-center text-xs text-slate-500">
            Nur {person?.displayName ?? 'die Person'} kann diese Reservierung ändern.
          </p>
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
