import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettlementScreen from './SettlementScreen'

/**
 * The yearly settlement used to show the month stepper, so stepping changed
 * the month label while the yearly figures stayed the same.
 */

const listTrips = vi.fn()
const listExpenses = vi.fn()

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider: { listTrips, listExpenses },
    profiles: [],
    settings: { splitRule: 'fixed_equal_variable_km', currency: 'EUR' },
  }),
  useProfileLookup: () => () => null,
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
