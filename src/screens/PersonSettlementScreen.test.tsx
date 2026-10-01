import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PersonSettlementScreen from './PersonSettlementScreen'
import SettlementScreen from './SettlementScreen'
import type { Car, Expense, Profile, SettlementPayment, Trip } from '../data/types'

/**
 * The statement must reconcile with the settlement card, and marking a
 * transfer as paid must record exactly the transfer for the shown period.
 */

const ANNA: Profile = { id: 'user-anna', displayName: 'Anna', color: '#0f766e', active: true }
const BERND: Profile = { id: 'user-bernd', displayName: 'Bernd', color: '#b45309', active: true }
const PEOPLE = [ANNA, BERND]
const CARS: Car[] = [
  { id: 'golf', name: 'Golf', licensePlate: null, initialOdometer: 0, active: true },
]
const AUDIT = { createdBy: null, updatedBy: null, updatedAt: null }

const trips: Trip[] = [
  {
    ...AUDIT,
    id: 't1',
    carId: 'golf',
    participantIds: [ANNA.id, BERND.id],
    bookingId: null,
    drivenOn: '2026-07-05',
    odometerStart: 1000,
    odometerEnd: 1200,
    distanceKm: 200,
    note: null,
  },
  {
    ...AUDIT,
    id: 't2',
    carId: 'golf',
    participantIds: [ANNA.id],
    bookingId: null,
    drivenOn: '2026-07-06',
    odometerStart: 1200,
    odometerEnd: 1300,
    distanceKm: 100,
    note: null,
  },
]

const expense = (extra: Partial<Expense>): Expense => ({
  ...AUDIT,
  id: 'e',
  carId: 'golf',
  userId: BERND.id,
  category: 'fuel',
  amountCents: 6_000,
  incurredOn: '2026-07-07',
  periodStart: null,
  periodEnd: null,
  liters: null,
  note: null,
  receiptPath: null,
  ...extra,
})

const expenses = [
  expense({ id: 'fuel' }),
  expense({ id: 'tax', category: 'tax', amountCents: 2_000, userId: ANNA.id }),
]

let payments: SettlementPayment[] = []
const createPayment = vi.fn()

const provider = {
  listTrips: async () => trips,
  listExpenses: async () => expenses,
  listBookings: async () => [],
  listPayments: async () => payments,
  createPayment,
  deletePayment: vi.fn(),
  subscribe: () => () => {},
}
const settings = { splitRule: 'fixed_equal_variable_km', currency: 'EUR' }

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ provider, profiles: PEOPLE, cars: CARS, settings }),
  useProfileLookup: () => (id: string) => PEOPLE.find((p) => p.id === id) ?? null,
}))

function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/abrechnung" element={<SettlementScreen />} />
        <Route path="/abrechnung/person/:userId" element={<PersonSettlementScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  payments = []
  createPayment.mockReset().mockResolvedValue({ ok: true, value: {} })
})

describe('person statement', () => {
  // Anna drove 100 + 200/2 = 200 of 300 km. Fuel 60 EUR by km: 40 EUR.
  // Tax 20 EUR split equally: 10 EUR. Her share is 50 EUR; she paid 20 EUR.
  it('lists each cost with the total and her share, summing to her share', async () => {
    open('/abrechnung/person/user-anna?zeitraum=monat&datum=2026-07')

    const fuel = (await screen.findByText(/Tanken · Golf/)).closest('tr')!
    expect(within(fuel).getByText('60,00 €')).toBeInTheDocument()
    expect(within(fuel).getByText('40,00 €')).toBeInTheDocument()
    expect(within(fuel).getByText('300 km')).toBeInTheDocument()
    expect(within(fuel).getByText('200 km')).toBeInTheDocument()

    const tax = screen
      .getAllByText(/KFZ-Steuer · Golf/)
      .map((cell) => cell.closest('tr'))
      .find(Boolean)!
    expect(within(tax).getByText('10,00 €')).toBeInTheDocument()

    const sum = screen.getByText('Summe').closest('tr')!
    expect(within(sum).getByText('50,00 €')).toBeInTheDocument()
    expect(screen.getByText('zahlt 30,00 €')).toBeInTheDocument()
  })

  it('goes back to the same period', async () => {
    open('/abrechnung/person/user-anna?zeitraum=jahr&datum=2026-07')
    await screen.findByText('Summe')
    fireEvent.click(screen.getByRole('link', { name: 'Zurück zur Abrechnung' }))
    expect(await screen.findByText('2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nächstes Jahr' })).toBeInTheDocument()
  })
})

describe('settlement page', () => {
  it('marks a transfer as paid for the period shown', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    open('/abrechnung?zeitraum=monat&datum=2026-07')

    fireEvent.click(await screen.findByRole('button', { name: 'Als bezahlt markieren' }))
    await vi.waitFor(() =>
      expect(createPayment).toHaveBeenCalledWith({
        fromUserId: ANNA.id,
        toUserId: BERND.id,
        amountCents: 3_000,
        appliesOn: '2026-07-31',
        note: null,
      }),
    )
    confirmSpy.mockRestore()
  })

  it('shows the cost per km and a gap nobody entered', async () => {
    const withGap = [
      ...trips,
      { ...trips[1], id: 't3', odometerStart: 1350, odometerEnd: 1400, distanceKm: 50 },
    ]
    provider.listTrips = async () => withGap
    open('/abrechnung?zeitraum=monat&datum=2026-07')
    expect(await screen.findByText(/Golf: 50 km ohne eingetragene Fahrt/)).toBeInTheDocument()
    expect(screen.getByText(/0,23 €\/km/)).toBeInTheDocument()
    provider.listTrips = async () => trips
  })

  it('links each person to their statement', async () => {
    open('/abrechnung?zeitraum=monat&datum=2026-07')
    const link = await screen.findByRole('link', { name: 'Kostenaufstellung für Anna' })
    expect(link).toHaveAttribute(
      'href',
      '/abrechnung/person/user-anna?zeitraum=monat&datum=2026-07',
    )
  })
})
