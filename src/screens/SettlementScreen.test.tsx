import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettlementScreen from './SettlementScreen'
import type { Car, Expense, Profile, Trip } from '../data/types'

/**
 * The yearly settlement used to show the month stepper, so stepping changed
 * the month label while the yearly figures stayed the same.
 */

const listTrips = vi.fn()
const listExpenses = vi.fn()

const provider = {
  listTrips,
  listExpenses,
  listBookings: async () => [],
  listPayments: async () => [],
  subscribe: () => () => {},
}
const settings = { splitRule: 'fixed_equal_variable_km', currency: 'EUR' }
/** Empty unless a test fills them. */
let profiles: Profile[] = []
let cars: Car[] = []

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider,
    profiles,
    cars,
    settings,
  }),
  useProfileLookup: () => (id: string) => profiles.find((p) => p.id === id) ?? null,
}))

function open(query = '?zeitraum=monat&datum=2026-07') {
  render(
    <MemoryRouter initialEntries={[`/abrechnung${query}`]}>
      <SettlementScreen />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listTrips.mockReset().mockResolvedValue([])
  listExpenses.mockReset().mockResolvedValue([])
  profiles = []
  cars = []
})

describe('settlement period', () => {
  it('steps months in the month view', () => {
    open()
    expect(screen.getByText('Juli 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }))
    expect(screen.getByText('August 2026')).toBeInTheDocument()
  })

  it('shows and steps whole years in the year view', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Jahr' }))

    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.queryByText('Juli 2026')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nächster Monat' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nächstes Jahr' }))
    expect(screen.getByText('2027')).toBeInTheDocument()
    expect(listTrips).toHaveBeenLastCalledWith({ from: '2027-01-01', to: '2027-12-31' })
  })

  it('keeps the chosen month when switching back from the year view', () => {
    open('?zeitraum=jahr&datum=2026-07')
    fireEvent.click(screen.getByRole('button', { name: 'Monat' }))
    expect(screen.getByText('Juli 2026')).toBeInTheDocument()
  })
})

describe('figures per car', () => {
  const ANNA: Profile = { id: 'anna', displayName: 'Anna', color: '#0f766e', active: true }
  const GOLF: Car = {
    id: 'golf',
    name: 'Golf',
    licensePlate: null,
    initialOdometer: 0,
    driveType: 'fuel',
    active: true,
  }
  const EUP: Car = { ...GOLF, id: 'eup', name: 'e-Up', driveType: 'electric' }

  const trip = (carId: string, km: number): Trip => ({
    id: `trip-${carId}`,
    carId,
    participantIds: [ANNA.id],
    bookingId: null,
    drivenOn: '2026-07-10',
    odometerStart: 1_000,
    odometerEnd: 1_000 + km,
    distanceKm: km,
    note: null,
    createdBy: null,
    updatedBy: null,
    updatedAt: null,
  })
  const cost = (extra: Partial<Expense>): Expense => ({
    id: 'e',
    carId: 'golf',
    userId: ANNA.id,
    category: 'fuel',
    amountCents: 0,
    incurredOn: '2026-07-11',
    periodStart: null,
    periodEnd: null,
    liters: null,
    kwh: null,
    note: null,
    receiptPath: null,
    createdBy: null,
    updatedBy: null,
    updatedAt: null,
    ...extra,
  })

  /** Renders the settlement and returns the text of one car's row in "Je Auto". */
  const figuresOf = async (name: string) => {
    open()
    const heading = await screen.findByRole('heading', { name: 'Je Auto' })
    const rows = Array.from(heading.nextElementSibling?.querySelectorAll('li') ?? [])
    return rows.find((row) => row.textContent?.startsWith(name))?.textContent ?? ''
  }

  beforeEach(() => {
    profiles = [ANNA]
    cars = [GOLF, EUP]
    // Golf: 500 km on 30 l for 60 EUR. e-Up: 400 km on 72 kWh for 28,80 EUR.
    listTrips.mockResolvedValue([trip('golf', 500), trip('eup', 400)])
    listExpenses.mockResolvedValue([
      cost({ id: 'f', amountCents: 6_000, liters: 30 }),
      cost({ id: 'c', carId: 'eup', category: 'charging', amountCents: 2_880, kwh: 72 }),
    ])
  })

  it('shows €/km and l/100 km for a fuel car', async () => {
    const golf = await figuresOf('Golf')
    expect(golf).toContain('0,12 €/km')
    expect(golf).toContain('6,0 l/100 km')
    expect(golf).not.toContain('kWh')
  })

  it('shows €/km and kWh/100 km for an electric car', async () => {
    const eup = await figuresOf('e-Up')
    expect(eup).toContain('Elektro')
    expect(eup).toContain('0,07 €/km')
    expect(eup).toContain('18,0 kWh/100 km')
    expect(eup).not.toContain('l/100 km')
  })

  it('shows the unit even before anything was charged', async () => {
    listExpenses.mockResolvedValue([
      cost({ id: 'r', carId: 'eup', category: 'repair', amountCents: 4_000 }),
    ])
    const eup = await figuresOf('e-Up')
    expect(eup).toContain('0,10 €/km')
    expect(eup).toMatch(/–s*$/)
  })

  it('keeps a sold car in the settlement, marked as inactive', async () => {
    cars = [GOLF, { ...EUP, active: false }]
    const eup = await figuresOf('e-Up')
    expect(eup).toContain('(inaktiv)')
    expect(eup).toContain('18,0 kWh/100 km')
  })
})
