import type { Booking } from '../data/types'
import { monthGridDays, overlapsDay, toISODate } from '../lib/dates'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/**
 * Month view as tiles. Each day carries a dot per person who has the car that
 * day, which is what makes a month readable at a glance on a phone - the times
 * themselves would never fit in a cell.
 */
export default function MonthGrid({
  month,
  bookings,
  selected,
  onSelect,
  colorOf,
}: {
  month: Date
  bookings: Booking[]
  selected: Date
  onSelect: (day: Date) => void
  colorOf: (userId: string) => string
}) {
  const days = monthGridDays(month)
  const today = toISODate(new Date())
  const selectedISO = toISODate(selected)

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label) => (
          <div key={label} className="text-center text-[11px] font-medium text-slate-500">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const iso = toISODate(day)
          const inMonth = day.getMonth() === month.getMonth()
          const isToday = iso === today
          const isSelected = iso === selectedISO

          const onDay = bookings.filter((b) => overlapsDay(b.startsAt, b.endsAt, day))
          // One dot per person, not per booking, so two trips by the same
          // person do not read as two different people.
          const people = [...new Set(onDay.map((b) => b.userId))]

          return (
            <button
              key={iso}
              onClick={() => onSelect(day)}
              aria-label={`${day.getDate()}. ${day.toLocaleDateString('de-DE', { month: 'long' })}, ${onDay.length} Reservierungen`}
              aria-pressed={isSelected}
              className={`flex aspect-square flex-col items-center justify-start rounded-lg border p-1 transition-colors ${
                isSelected
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : isToday
                    ? 'border-brand-600 bg-white'
                    : 'border-transparent bg-white'
              } ${!inMonth && !isSelected ? 'opacity-40' : ''}`}
            >
              <span
                className={`text-xs font-medium tabular-nums ${
                  isSelected ? 'text-white' : isToday ? 'text-brand-700' : 'text-slate-700'
                }`}
              >
                {day.getDate()}
              </span>

              <span className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                {people.slice(0, 3).map((userId) => (
                  <span
                    key={userId}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.9)' : colorOf(userId),
                    }}
                  />
                ))}
                {people.length > 3 ? (
                  <span
                    className={`text-[9px] leading-none ${
                      isSelected ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    +{people.length - 3}
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
