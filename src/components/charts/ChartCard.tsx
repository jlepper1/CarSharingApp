import type { ReactNode } from 'react'
import { Card } from '../ui'

/**
 * Frame shared by the settlement charts: the question the chart answers as
 * its title, a legend, the chart, a line that names whatever was tapped (a
 * phone has no hover), and the same numbers as a table for anyone who cannot
 * tell the colours apart.
 */
export default function ChartCard({
  title,
  legend,
  tip,
  table,
  children,
}: {
  title: string
  legend?: ReactNode
  /** Text for the mark last tapped or hovered. */
  tip: string | null
  table: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="mb-3">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {legend ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{legend}</div> : null}
      <div className="mt-3">{children}</div>
      <p className="mt-2 min-h-4 text-xs text-slate-500" aria-live="polite">
        {tip ?? 'Für Details auf einen Balken tippen.'}
      </p>
      <details className="mt-2 text-xs text-slate-600 print:hidden">
        <summary className="cursor-pointer text-brand-700">Zahlen als Tabelle</summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </Card>
  )
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

/** Plain table used as the text alternative of every chart. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse tabular-nums">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              className={`border-b border-slate-200 py-1 font-medium text-slate-500 ${i === 0 ? 'text-left' : 'text-right'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td
                key={i}
                className={`border-b border-slate-100 py-1 ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
