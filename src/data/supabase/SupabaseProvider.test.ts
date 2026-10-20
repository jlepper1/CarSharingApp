import { describe, expect, it } from 'vitest'
import { toFailure } from './SupabaseProvider'

/** Database refusals have to reach the family as a sentence they can act on. */

describe('toFailure', () => {
  it('explains that a disabled car cannot be booked or driven', () => {
    const failure = toFailure({ code: 'CS001', message: 'Dieses Auto ist deaktiviert.' })
    expect(failure.reason).toBe('validation')
    expect(failure.message).toMatch(/deaktiviert.*wieder aktivieren/)
  })

  it('points at the quantity when a litre or kWh check fails', () => {
    const failure = toFailure({
      code: '23514',
      message: 'new row for relation "expenses" violates check constraint "expenses_kwh_positive"',
    })
    expect(failure.message).toMatch(/Liter bzw\. kWh/)
  })

  it('still points at date and odometer for the other checks', () => {
    const failure = toFailure({
      code: '23514',
      message: 'new row for relation "trips" violates check constraint "trips_odometer_order"',
    })
    expect(failure.message).toMatch(/Datum und Kilometerstand/)
  })

  it('names the overlap for a double booking', () => {
    expect(toFailure({ code: '23P01', message: '' }).reason).toBe('conflict')
  })
})
