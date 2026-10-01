import { useMemo, useState } from 'react'
import type { Car, Profile, Trip } from '../../data/types'
import { formatKm } from '../../lib/format'
import { kmByUserAndCar } from '../../lib/settlement'
import ChartCard, { DataTable, LegendItem } from './ChartCard'
import { carColor } from './palette'

/** "Wer ist wie viel gefahren – mit welchem Auto?" One stacked bar per person. */
export default function KmByCarChart({
  trips,
  cars,
  profiles,
}: {
  trips: Trip[]
  cars: Car[]
  profiles: Profile[]
}) {
  const [tip, setTip] = useState<string | null>(null)

  // Cars that were driven, in the app's car order so colours stay put.
  const { rows, usedCars, max } = useMemo(() => {
    const byUser = kmByUserAndCar(trips)
    const driven = new Set(trips.map((t) => t.carId))
    const usedCars = cars.filter((c) => driven.has(c.id))
    const rows = profiles
      .map((person) => {
        const byCar = byUser.get(person.id) ?? new Map<string, number>()
        const segments = usedCars
          .map((car) => ({ car, km: byCar.get(car.id) ?? 0 }))
          .filter((s) => s.km > 0)
        return { person, segments, total: segments.reduce((a, s) => a + s.km, 0) }
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
    return { rows, usedCars, max: Math.max(1, ...rows.map((r) => r.total)) }
  }, [trips, cars, profiles])

  if (rows.length === 0) return null
  const colorOf = (car: Car) => carColor(cars.findIndex((c) => c.id === car.id))

  return (
    <ChartCard
      title="Wer ist wie viel gefahren – mit welchem Auto?"
      legend={usedCars.map((car) => (
        <LegendItem key={car.id} color={colorOf(car)} label={car.name} />
      ))}
      tip={tip}
      table={
        <DataTable
          head={['Person', ...usedCars.map((c) => c.name), 'Gesamt']}
          rows={rows.map((row) => [
            row.person.displayName,
            ...usedCars.map((car) =>
              formatKm(row.segments.find((s) => s.car.id === car.id)?.km ?? 0),
            ),
            formatKm(row.total),
          ])}
        />
      }
    >
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.person.id}>
            <div className="mb-1 text-xs text-slate-600">{row.person.displayName}</div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div
                  className="flex h-3 gap-[2px] overflow-hidden rounded-r"
                  style={{ width: `${(row.total / max) * 100}%` }}
                >
                  {row.segments.map((segment) => {
                    const label = `${row.person.displayName} · ${segment.car.name}: ${formatKm(segment.km)}`
                    return (
                      <button
                        key={segment.car.id}
                        type="button"
                        title={label}
                        aria-label={label}
                        onClick={() => setTip(label)}
                        onMouseEnter={() => setTip(label)}
                        className="h-full min-w-[3px]"
                        style={{
                          flexGrow: segment.km,
                          flexBasis: 0,
                          backgroundColor: colorOf(segment.car),
                        }}
                      />
                    )
                  })}
                </div>
              </div>
              <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
                {formatKm(row.total)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}
