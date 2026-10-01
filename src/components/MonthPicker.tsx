import { Button } from './ui'
import { formatMonth } from '../lib/dates'

/**
 * Previous / next stepper shared by the trips, costs and settlement screens.
 *
 * With `unit="year"` it steps and shows whole years, so a yearly settlement
 * cannot be "moved" to another month that changes nothing on screen.
 */
export default function MonthPicker({
  month,
  onChange,
  unit = 'month',
}: {
  month: Date
  onChange: (next: Date) => void
  unit?: 'month' | 'year'
}) {
  const yearly = unit === 'year'

  function step(delta: number) {
    onChange(new Date(month.getFullYear(), month.getMonth() + delta * (yearly ? 12 : 1), 1))
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      <Button
        variant="secondary"
        className="px-3"
        onClick={() => step(-1)}
        aria-label={yearly ? 'Vorheriges Jahr' : 'Vorheriger Monat'}
      >
        ‹
      </Button>
      <div className="flex-1 text-center text-sm font-medium text-slate-700">
        {yearly ? month.getFullYear() : formatMonth(month)}
      </div>
      <Button
        variant="secondary"
        className="px-3"
        onClick={() => step(1)}
        aria-label={yearly ? 'Nächstes Jahr' : 'Nächster Monat'}
      >
        ›
      </Button>
    </div>
  )
}
