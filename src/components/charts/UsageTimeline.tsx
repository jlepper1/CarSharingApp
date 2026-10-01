import { useMemo, useState } from 'react'
import type { DateRange } from '../../data/DataProvider'
import type { Booking, Car, Profile, Trip, UUID } from '../../data/types'
import { addDays, formatDateISO, formatDay, formatTime, fromISODate } from '../../lib/dates'
import { formatKm } from '../../lib/format'
import { joinNames } from '../Sheet'
import ChartCard, { DataTable, LegendItem } from './ChartCard'

const HOUR = 3_600_000
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * "Wer hatte wann welches Auto?" One lane per car across the period:
 * reservations as bars in the person's colour, trips as dots on the day they
 * were driven (one dot per person on the trip). Names ride inside bars that
 * are wide enough, so nobody has to match colours alone.
 */
export default function UsageTimeline({
  bookings,
  trips,
  cars,
  profiles,
  range,
  period,
}: {
  bookings: Booking[]
  trips: Trip[]
  cars: Car[]
  profiles: Profile[]
  range: DateRange
  period: 'month' | 'year'
}) {
  const [tip, setTip] = useState<string | null>(null)

  const start = fromISODate(range.from).getTime()
  const end = addDays(fromISODate(range.to), 1).getTime()
  const span = end - start
  const pct = (t: number) => ((t - start) / span) * 100

  const person = (id: UUID) => profiles.find((p) => p.id === id)
  const name = (id: UUID) => person(id)?.displayName ?? 'Unbekannt'
  const color = (id: UUID) => person(id)?.color ?? '#94a3b8'

  const lanes = useMemo(() => {
    const at = (t: number) => ((t - start) / (end - start)) * 100
    const used = new Set([...bookings.map((b) => b.carId), ...trips.map((t) => t.carId)])
    return cars
      .filter((car) => car.active || used.has(car.id))
      .map((car) => ({
        car,
        bars: bookings
          .filter((b) => b.carId === car.id)
          .map((booking) => {
            const from = Math.max(start, new Date(booking.startsAt).getTime())
            const to = Math.min(end, new Date(booking.endsAt).getTime())
            return { booking, left: at(from), width: Math.max(at(to) - at(from), 0.5) }
          })
          .filter((bar) => bar.width > 0 && bar.left < 100),
        dots: trips
          .filter((t) => t.carId === car.id)
          .map((trip) => ({ trip, left: at(fromISODate(trip.drivenOn).getTime() + 12 * HOUR) })),
      }))
  }, [bookings, trips, cars, start, end])

  const people = useMemo(() => {
    const ids = new Set<UUID>()
    for (const b of bookings) ids.add(b.userId)
    for (const t of trips) for (const id of t.participantIds) ids.add(id)
    return profiles.filter((p) => ids.has(p.id))
  }, [bookings, trips, profiles])

  if (bookings.length === 0 && trips.length === 0) return null

  const ticks =
    period === 'year'
      ? MONTH_LETTERS.map((letter, month) => ({
          label: letter,
          left: pct(new Date(fromISODate(range.from).getFullYear(), month, 1).getTime()),
        }))
      : [1, 8, 15, 22, 29].map((day) => ({
          label: `${day}.`,
          left: pct(addDays(fromISODate(range.from), day - 1).getTime()),
        }))

  const bookingLabel = (b: Booking) => {
    const from = new Date(b.startsAt)
    const to = new Date(b.endsAt)
    return `${formatDay(from)}, ${formatTime(from)} – ${formatDay(to)}, ${formatTime(to)}`
  }

  return (
    <ChartCard
      title="Wer hatte wann welches Auto?"
      legend={
        <>
          {people.map((p) => (
            <LegendItem key={p.id} color={p.color} label={p.displayName} />
          ))}
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            Balken = Reservierung · Punkt = Fahrt
          </span>
        </>
      }
      tip={tip}
      table={
        <DataTable
          head={['Auto', 'Art', 'Wer', 'Wann']}
          rows={lanes.flatMap(({ car, bars, dots }) => [
            ...bars.map(({ booking }) => [
              car.name,
              'Reservierung',
              name(booking.userId),
              bookingLabel(booking),
            ]),
            ...dots.map(({ trip }) => [
              car.name,
              `Fahrt, ${formatKm(trip.distanceKm)}`,
              joinNames(trip.participantIds.map(name)),
              formatDateISO(trip.drivenOn),
            ]),
          ])}
        />
      }
    >
      <div className="relative">
        {lanes.map(({ car, bars, dots }) => (
          <div key={car.id} className="mb-3">
            <div className="mb-1 text-xs text-slate-600">{car.name}</div>
            <div className="relative h-5 rounded bg-slate-100">
              {ticks.map((tick) => (
                <span
                  key={tick.left}
                  className="absolute inset-y-0 w-px bg-slate-200"
                  style={{ left: `${tick.left}%` }}
                />
              ))}
              {bars.map(({ booking, left, width }) => {
                const label = `${name(booking.userId)} · ${car.name} · ${bookingLabel(booking)}`
                return (
                  <button
                    key={booking.id}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => setTip(label)}
                    onMouseEnter={() => setTip(label)}
                    className="absolute inset-y-0 overflow-hidden rounded-sm px-1 text-left text-[10px] leading-5 font-medium text-white ring-1 ring-white"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      minWidth: 3,
                      backgroundColor: color(booking.userId),
                    }}
                  >
                    {width >= 12 ? name(booking.userId) : null}
                  </button>
                )
              })}
            </div>
            <div className="relative mt-1 h-3">
              {dots.map(({ trip, left }) =>
                trip.participantIds.map((id, index) => {
                  const label = `Fahrt · ${joinNames(trip.participantIds.map(name))} · ${car.name} · ${formatDateISO(trip.drivenOn)} · ${formatKm(trip.distanceKm)}`
                  return (
                    <button
                      key={`${trip.id}-${id}`}
                      type="button"
                      title={label}
                      aria-label={label}
                      onClick={() => setTip(label)}
                      onMouseEnter={() => setTip(label)}
                      className="absolute top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-white"
                      style={{
                        left: `calc(${left}% + ${index * 6}px)`,
                        backgroundColor: color(id),
                      }}
                    />
                  )
                }),
              )}
            </div>
          </div>
        ))}
        <div className="relative h-4 text-[10px] text-slate-400">
          {ticks.map((tick) => (
            <span
              key={tick.left}
              className="absolute -translate-x-1/2"
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}
