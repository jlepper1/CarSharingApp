import { describe, expect, it } from 'vitest'
import { formatCents, formatDuration, parseAmountToCents } from './format'

describe('parseAmountToCents', () => {
  it('accepts the German comma', () => {
    expect(parseAmountToCents('54,90')).toBe(5490)
  })

  it('accepts a full stop just as well', () => {
    expect(parseAmountToCents('54.90')).toBe(5490)
  })

  it('accepts whole amounts', () => {
    expect(parseAmountToCents('12')).toBe(1200)
  })

  it('ignores surrounding spaces', () => {
    expect(parseAmountToCents('  7,50 ')).toBe(750)
  })

  it('handles a single decimal place', () => {
    expect(parseAmountToCents('7,5')).toBe(750)
  })

  it('rejects anything that is not a plain amount', () => {
    for (const input of ['', 'abc', '5,999', '1,2,3', '12 €', '--4']) {
      expect(parseAmountToCents(input)).toBeNull()
    }
  })

  it('never returns a fractional cent', () => {
    for (const input of ['0,01', '999,99', '1,10']) {
      expect(Number.isInteger(parseAmountToCents(input))).toBe(true)
    }
  })
})

describe('formatCents', () => {
  it('formats as German euro', () => {
    // Intl uses a non-breaking space before the currency symbol.
    expect(formatCents(5490).replace(/ /g, ' ')).toBe('54,90 €')
  })

  it('round-trips with parseAmountToCents', () => {
    for (const cents of [1, 99, 100, 5490, 123456]) {
      const text = formatCents(cents).replace(/\s?€/, '').replace(/\./g, '')
      expect(parseAmountToCents(text)).toBe(cents)
    }
  })
})

describe('formatDuration', () => {
  const day = new Date(2026, 8, 21)
  const at = (hours: number, minutes = 0, plusDays = 0) => {
    const d = new Date(day)
    d.setDate(d.getDate() + plusDays)
    d.setHours(hours, minutes, 0, 0)
    return d.toISOString()
  }

  it('reports whole hours', () => {
    expect(formatDuration(at(9), at(17))).toBe('8 Std.')
  })

  it('reports hours and minutes within a day', () => {
    expect(formatDuration(at(9), at(10, 30))).toBe('1 Std. 30 Min.')
  })

  it('reports minutes alone', () => {
    expect(formatDuration(at(9), at(9, 45))).toBe('45 Min.')
  })

  it('uses the singular for one day', () => {
    expect(formatDuration(at(9), at(9, 0, 1))).toBe('1 Tag')
  })

  it('combines days and hours', () => {
    expect(formatDuration(at(9), at(13, 0, 2))).toBe('2 Tage 4 Std.')
  })

  it('marks a range that does not move forward', () => {
    expect(formatDuration(at(17), at(9))).toBe('–')
    expect(formatDuration(at(9), at(9))).toBe('–')
  })
})
