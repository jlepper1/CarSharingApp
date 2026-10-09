import { describe, expect, it } from 'vitest'
import type { Car, Expense, Profile, Trip } from '../data/types'
import { buildSettlementCsv, csvCell } from './exportCsv'
import { computeSettlement } from './settlement'

const AUDIT = { createdBy: null, updatedBy: null, updatedAt: null }
const profiles: Profile[] = [
  { id: 'a', displayName: 'Anna', color: '#000', active: true },
  { id: 'b', displayName: 'Bernd', color: '#000', active: true },
]
const cars: Car[] = [
  { id: 'golf', name: 'Golf', licensePlate: null, initialOdometer: 0, active: true },
]
const trips: Trip[] = [
  {
    ...AUDIT,
    id: 't',
    carId: 'golf',
    participantIds: ['a', 'b'],
    bookingId: null,
    drivenOn: '2026-07-05',
    odometerStart: 1000,
    odometerEnd: 1101,
    distanceKm: 101,
    note: 'Ausflug; "Ostsee"',
  },
]
const expenses: Expense[] = [
  {
    ...AUDIT,
    id: 'e',
    carId: 'golf',
    userId: 'a',
    category: 'fuel',
    amountCents: 5_490,
    incurredOn: '2026-07-06',
    periodStart: null,
    periodEnd: null,
    liters: null,
    note: null,
    receiptPath: null,
  },
]
const range = { from: '2026-07-01', to: '2026-07-31' }

describe('csvCell', () => {
  it('quotes fields with separators and doubles inner quotes', () => {
    expect(csvCell('Ausflug; "Ostsee"')).toBe('"Ausflug; ""Ostsee"""')
    expect(csvCell('Golf')).toBe('Golf')
  })

  it('keeps formulas from running in Excel', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+49 170')).toBe("'+49 170")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('- Reifen')).toBe("'- Reifen")
  })

  it('leaves negative amounts and percentages as numbers', () => {
    expect(csvCell('-12,50')).toBe('-12,50')
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell('40 %')).toBe('40 %')
  })
})

describe('buildSettlementCsv', () => {
  const result = computeSettlement({ profiles, trips, expenses, rule: 'all_by_km', range })
  const csv = buildSettlementCsv({
    result,
    trips,
    payments: [],
    profiles,
    cars,
    periodLabel: 'Juli 2026',
  })
  const lines = csv.split('\r\n')

  it('starts with a byte-order mark so Excel reads the umlauts', () => {
    expect(csv.startsWith(String.fromCharCode(0xfeff))).toBe(true)
  })

  it('uses semicolons and decimal commas', () => {
    expect(lines).toContain('Kosten gesamt (EUR);54,90')
    expect(lines).toContain('Anna;50,5;50 %;27,45;54,90;0,00;27,45')
  })

  it('lists every receipt with each person’s share', () => {
    expect(lines).toContain('Mo., 06.07.;Tanken;Golf;Anna;54,90;nach km;27,45;27,45')
  })

  it('lists trips with everyone on them and escapes the note', () => {
    expect(lines).toContain('So., 05.07.;Golf;1000;1101;101;Anna, Bernd;"Ausflug; ""Ostsee"""')
  })
})
