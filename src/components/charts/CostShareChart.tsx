import { useState } from 'react'
import { formatCents } from '../../lib/format'
import type { PersonSettlement } from '../../lib/settlement'
import ChartCard, { DataTable, LegendItem } from './ChartCard'
import { PAID_COLOR, SHARE_COLOR } from './palette'

/**
 * "Wer trug wie viel Kosten?" Per person the share of the costs (what they
 * carry) next to what they paid out of pocket. The gap between the two bars
 * is exactly why someone receives or pays in the settlement.
 */
export default function CostShareChart({ people }: { people: PersonSettlement[] }) {
  const [tip, setTip] = useState<string | null>(null)

  const rows = people.filter((p) => p.owesCents !== 0 || p.paidCents !== 0)
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.flatMap((p) => [p.owesCents, p.paidCents]))

  return (
    <ChartCard
      title="Wer trug wie viel Kosten?"
      legend={
        <>
          <LegendItem color={SHARE_COLOR} label="Anteil an den Kosten" />
          <LegendItem color={PAID_COLOR} label="Selbst bezahlt" />
        </>
      }
      tip={tip}
      table={
        <DataTable
          head={['Person', 'Anteil', 'Bezahlt', 'Differenz']}
          rows={rows.map((p) => [
            p.displayName,
            formatCents(p.owesCents),
            formatCents(p.paidCents),
            formatCents(p.paidCents - p.owesCents),
          ])}
        />
      }
    >
      <ul className="space-y-3">
        {rows.map((person) => (
          <li key={person.userId}>
            <div className="mb-1 text-xs text-slate-600">{person.displayName}</div>
            <Bar
              cents={person.owesCents}
              max={max}
              color={SHARE_COLOR}
              label={`${person.displayName} · Anteil: ${formatCents(person.owesCents)}`}
              onTip={setTip}
            />
            <Bar
              cents={person.paidCents}
              max={max}
              color={PAID_COLOR}
              label={`${person.displayName} · selbst bezahlt: ${formatCents(person.paidCents)}`}
              onTip={setTip}
            />
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

function Bar({
  cents,
  max,
  color,
  label,
  onTip,
}: {
  cents: number
  max: number
  color: string
  label: string
  onTip: (text: string) => void
}) {
  const width = Math.max(0, cents) / max
  return (
    <div className="mt-[2px] flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onTip(label)}
          onMouseEnter={() => onTip(label)}
          className="h-2.5 rounded-r"
          style={{
            display: 'block',
            width: `${width * 100}%`,
            minWidth: cents > 0 ? 3 : 0,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-600">
        {formatCents(cents)}
      </span>
    </div>
  )
}
