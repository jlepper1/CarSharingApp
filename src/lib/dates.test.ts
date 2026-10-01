import { describe, expect, it } from 'vitest'
import {
  daySegment,
  endFollowingStart,
  formatPeriod,
  monthGridDays,
  overlapsDay,
} from './dates'

/**
 * A reservation spanning several days must not repeat its start and end time
 * on every day. Each day runs to midnight and the next one starts at 00:00.
 */

const MONDAY = new Date(2026, 8, 21)
const TUESDAY = new Date(2026, 8, 22)
const WEDNESDAY = new Date(2026, 8, 23)
const THURSDAY = new Date(2026, 8, 24)

/** Local wall-clock time as the app stores it: an ISO instant. */
function at(day: Date, hours: number, minutes = 0): string {
  const d = new Date(day)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

describe('daySegment', () => {
  it('shows the real times for a booking inside one day', () => {
    const segment = daySegment(at(MONDAY, 9), at(MONDAY, 17), MONDAY)
    expect(segment.label).toBe('09:00 – 17:00')
    expect(segment.startsEarlier).toBe(false)
    expect(segment.endsLater).toBe(false)
  })

  describe('a booking from Monday 09:00 to Wednesday 17:00', () => {
    const starts = at(MONDAY, 9)
    const ends = at(WEDNESDAY, 17)

    it('runs from 09:00 to midnight on the first day', () => {
      const segment = daySegment(starts, ends, MONDAY)
      expect(segment.label).toBe('09:00 – 24:00')
      expect(segment.startsEarlier).toBe(false)
      expect(segment.endsLater).toBe(true)
    })

    it('covers the whole of the day in between', () => {
      const segment = daySegment(starts, ends, TUESDAY)
      expect(segment.label).toBe('00:00 – 24:00')
      expect(segment.startsEarlier).toBe(true)
      expect(segment.endsLater).toBe(true)
    })

    it('runs from midnight to 17:00 on the last day', () => {
      const segment = daySegment(starts, ends, WEDNESDAY)
      expect(segment.label).toBe('00:00 – 17:00')
      expect(segment.startsEarlier).toBe(true)
      expect(segment.endsLater).toBe(false)
    })

    it('never repeats the booking times on a later day', () => {
      const labels = [MONDAY, TUESDAY, WEDNESDAY].map(
        (day) => daySegment(starts, ends, day).label,
      )
      expect(new Set(labels).size).toBe(3)
      expect(labels.filter((l) => l === '09:00 – 17:00')).toHaveLength(0)
    })
  })

  it('ends a booking that stops at midnight with 24:00, not 00:00', () => {
    const segment = daySegment(at(MONDAY, 9), at(TUESDAY, 0), MONDAY)
    expect(segment.label).toBe('09:00 – 24:00')
    expect(segment.endsLater).toBe(false)
  })

  it('keeps minutes intact', () => {
    const segment = daySegment(at(MONDAY, 8, 30), at(MONDAY, 18, 45), MONDAY)
    expect(segment.label).toBe('08:30 – 18:45')
  })
})

describe('overlapsDay', () => {
  const starts = at(MONDAY, 9)
  const ends = at(WEDNESDAY, 17)

  it('covers every day the booking touches', () => {
    expect(overlapsDay(starts, ends, MONDAY)).toBe(true)
    expect(overlapsDay(starts, ends, TUESDAY)).toBe(true)
    expect(overlapsDay(starts, ends, WEDNESDAY)).toBe(true)
  })

  it('stops after the booking ends', () => {
    expect(overlapsDay(starts, ends, THURSDAY)).toBe(false)
  })

  it('does not spill onto the next day when it ends exactly at midnight', () => {
    expect(overlapsDay(at(MONDAY, 9), at(TUESDAY, 0), TUESDAY)).toBe(false)
  })
})

describe('monthGridDays', () => {
  // Checked across two years rather than one hand-picked month, so no calendar
  // quirk (leap year, month starting on a Sunday) slips through.
  const months = Array.from({ length: 24 }, (_, i) => new Date(2026, i, 1))

  it('always covers whole weeks, Monday to Sunday', () => {
    for (const month of months) {
      const days = monthGridDays(month)
      expect(days.length % 7).toBe(0)
      expect(days[0].getDay()).toBe(1)
      expect(days[days.length - 1].getDay()).toBe(0)
    }
  })

  it('contains every day of the month', () => {
    for (const month of months) {
      const days = monthGridDays(month)
      const inMonth = days.filter((d) => d.getMonth() === month.getMonth())
      const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      expect(inMonth).toHaveLength(lastOfMonth)
      expect(inMonth[0].getDate()).toBe(1)
      expect(inMonth[inMonth.length - 1].getDate()).toBe(lastOfMonth)
    }
  })

  it('never adds a row that belongs entirely to another month', () => {
    for (const month of months) {
      const days = monthGridDays(month)
      for (let i = 0; i < days.length; i += 7) {
        const week = days.slice(i, i + 7)
        expect(week.some((d) => d.getMonth() === month.getMonth())).toBe(true)
      }
    }
  })
})

describe('endFollowingStart', () => {
  it('moves the end by the same amount, keeping the duration', () => {
    expect(
      endFollowingStart('2026-09-21T09:00', '2026-09-21T11:00', '2026-09-21T17:00'),
    ).toBe('2026-09-21T19:00')
  })

  it('carries the end into the next day when the start moves late', () => {
    expect(
      endFollowingStart('2026-09-21T09:00', '2026-09-21T20:00', '2026-09-21T17:00'),
    ).toBe('2026-09-22T04:00')
  })

  it('moves the end backwards when the start moves earlier', () => {
    expect(
      endFollowingStart('2026-09-21T09:00', '2026-09-20T09:00', '2026-09-21T17:00'),
    ).toBe('2026-09-20T17:00')
  })

  it('keeps a multi-day reservation the same length', () => {
    expect(
      endFollowingStart('2026-09-21T09:00', '2026-09-28T09:00', '2026-09-23T17:00'),
    ).toBe('2026-09-30T17:00')
  })

  it('leaves the end alone when the start did not really move', () => {
    expect(
      endFollowingStart('2026-09-21T09:00', '2026-09-21T09:00', '2026-09-21T17:00'),
    ).toBe('2026-09-21T17:00')
  })

  it('leaves the end alone when a value is empty or unusable', () => {
    expect(endFollowingStart('', '2026-09-21T11:00', '2026-09-21T17:00')).toBe('2026-09-21T17:00')
    expect(endFollowingStart('2026-09-21T09:00', '', '2026-09-21T17:00')).toBe('2026-09-21T17:00')
    expect(endFollowingStart('2026-09-21T09:00', '2026-09-21T11:00', '')).toBe('')
  })

  it('never lets the end overtake the start', () => {
    const starts = ['2026-09-21T00:00', '2026-09-21T23:30', '2026-12-31T22:00']
    for (const next of starts) {
      const end = endFollowingStart('2026-09-21T09:00', next, '2026-09-21T17:00')
      expect(new Date(end).getTime()).toBeGreaterThan(new Date(next).getTime())
    }
  })
})

describe('formatPeriod', () => {
  it('shows the year once when both dates share it', () => {
    expect(formatPeriod('2026-01-01', '2026-12-31')).toBe('01.01.–31.12.2026')
  })

  it('shows both years across a year boundary', () => {
    expect(formatPeriod('2026-04-01', '2027-03-31')).toBe('01.04.2026–31.03.2027')
  })
})
