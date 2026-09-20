import { Button } from './ui'
import { formatMonth } from '../lib/dates'

/** Previous / next month stepper shared by the trips, costs and settlement screens. */
export default function MonthPicker({
  month,
  onChange,
}: {
  month: Date
  onChange: (next: Date) => void
}) {
  function step(delta: number) {
    onChange(new Date(month.getFullYear(), month.getMonth() + delta, 1))
  }

  return (
    <div className="mb-3 flex items-center gap-2">
      <Button variant="secondary" className="px-3" onClick={() => step(-1)} aria-label="Vorheriger Monat">
        ‹
      </Button>
      <div className="flex-1 text-center text-sm font-medium text-slate-700">{formatMonth(month)}</div>
      <Button variant="secondary" className="px-3" onClick={() => step(1)} aria-label="Nächster Monat">
        ›
      </Button>
    </div>
  )
}
