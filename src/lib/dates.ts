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

/**
 * Moving the start drags the end along, keeping the reservation the same
 * length. Saves correcting both fields when a booking simply shifts.
 *
 * Both values are `<input type="datetime-local">` strings. An unusable or
 * empty value leaves the end alone rather than inventing one.
 */
export function endFollowingStart(
  previousStart: string,
  nextStart: string,
  currentEnd: string,
): string {
  const previous = new Date(previousStart)
  const next = new Date(nextStart)
  const end = new Date(currentEnd)

  if ([previous, next, end].some((d) => Number.isNaN(d.getTime()))) return currentEnd

  const shift = next.getTime() - previous.getTime()
  if (shift === 0) return currentEnd

  return toDateTimeLocal(new Date(end.getTime() + shift))
}

/**
 * Every day shown in a month grid: whole weeks, Monday first, padded with the
 * tail of the previous month and the head of the next so the rows stay square.
 * Five or six rows depending on how the month falls, never a blank row.
 */
export function monthGridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const start = startOfWeek(first)
  const end = addDays(startOfWeek(last), 7)

  const days: Date[] = []
  for (let day = start; day < end; day = addDays(day, 1)) days.push(day)
  return days
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

export interface DaySegment {
  /** The booking was already running before this day began. */
  startsEarlier: boolean
  /** The booking carries on past the end of this day. */
  endsLater: boolean
  /** For example `09:00 – 24:00`, `00:00 – 24:00`, `00:00 – 17:00`. */
  label: string
}

/**
 * The part of a booking that falls on one particular day.
 *
 * A reservation from Monday 09:00 until Wednesday 17:00 occupies Monday from
 * 09:00 to midnight, the whole of Tuesday, and Wednesday until 17:00. It does
 * not begin again at 09:00 each morning, which is what showing the booking's
 * absolute start and end on every day would imply.
 */
export function daySegment(startsAt: string, endsAt: string, day: Date): DaySegment {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = addDays(dayStart, 1)

  const start = new Date(startsAt)
  const end = new Date(endsAt)

  const startsEarlier = start < dayStart
  const endsLater = end > dayEnd

  const from = startsEarlier ? '00:00' : formatTime(start)
  // Midnight closing this day reads as 24:00, not as 00:00 of the next one.
  const to = endsLater || end.getTime() === dayEnd.getTime() ? '24:00' : formatTime(end)

  return { startsEarlier, endsLater, label: `${from} – ${to}` }
}
