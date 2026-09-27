import { describe, expect, it } from 'vitest'
import { daySegment, overlapsDay } from './dates'

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
