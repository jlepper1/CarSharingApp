import type { DateRange } from '../data/DataProvider'
import type { ISODate } from '../data/types'

/** Date helpers. All calendar days are `YYYY-MM-DD` in the phone's timezone. */

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function fromISODate(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Monday of the week containing `date` - German weeks start on Monday. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  const monday = addDays(date, offset)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function weekRange(date: Date): DateRange {
  const monday = startOfWeek(date)
  return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) }
}

export function monthRange(year: number, monthIndex: number): DateRange {
  return {
    from: toISODate(new Date(year, monthIndex, 1)),
    to: toISODate(new Date(year, monthIndex + 1, 0)),
  }
}

export function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

const dayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
const longDayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })

export const formatDay = (d: Date) => dayFormat.format(d)
export const formatLongDay = (d: Date) => longDayFormat.format(d)
export const formatTime = (d: Date) => timeFormat.format(d)
export const formatMonth = (d: Date) => monthFormat.format(d)

export function formatDateISO(date: ISODate): string {
  return dayFormat.format(fromISODate(date))
}

/** Value for `<input type="datetime-local">`, which wants local time. */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeLocal(value: string): Date {
  return new Date(value)
}

/** Monday..Sunday of the week containing `date`. */
export function weekDays(date: Date): Date[] {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function sameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b)
}

export function overlapsDay(startsAt: string, endsAt: string, day: Date): boolean {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = addDays(dayStart, 1)
  return new Date(startsAt) < dayEnd && new Date(endsAt) > dayStart
}
