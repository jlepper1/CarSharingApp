import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarScreen from './CalendarScreen'
import type { Car, Profile } from '../data/types'

/**
 * Covers the form for creating a reservation, which lives inside this screen.
 * The point of interest is that the end follows the start, so a booking can be
 * entered by touching one field instead of two.
 */

const listBookings = vi.fn()
const createBooking = vi.fn()

const CARS: Car[] = [
  { id: 'car-1', name: 'VW Golf', licensePlate: null, initialOdometer: 0, active: true },
  { id: 'car-2', name: 'Opel Corsa', licensePlate: null, initialOdometer: 0, active: true },
]

const ANNA: Profile = { id: 'user-anna', displayName: 'Anna', color: '#0f766e', active: true }

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider: {
      listBookings,
      createBooking,
      deleteBooking: vi.fn(),
      updateBooking: vi.fn(),
      subscribe: () => () => {},
    },
    cars: CARS,
    user: { id: ANNA.id, email: 'anna@example.com' },
  }),
  useProfileLookup: () => (id: string) => (id === ANNA.id ? ANNA : null),
}))

const fromField = () => screen.getByLabelText(/^Von/) as HTMLInputElement
const toField = () => screen.getByLabelText(/^Bis/) as HTMLInputElement

/** Open the create form via the button in the screen header. */
async function openForm() {
  render(<CalendarScreen />)
  const buttons = await screen.findAllByRole('button', { name: /\+ Reservieren/ })
  fireEvent.click(buttons[0])
  return await screen.findByRole('button', { name: /^Reservieren$/ })
}

beforeEach(() => {
  listBookings.mockReset().mockResolvedValue([])
  createBooking.mockReset().mockResolvedValue({ ok: true, value: {} })
})

describe('creating a reservation', () => {
  it('offers a whole working day by default', async () => {
    await openForm()
    expect(fromField().value).toMatch(/T09:00$/)
    expect(toField().value).toMatch(/T17:00$/)
  })

  it('moves the end when the start changes, keeping the length', async () => {
    await openForm()
    const day = fromField().value.slice(0, 10)

    fireEvent.change(fromField(), { target: { value: `${day}T14:00` } })

    expect(fromField().value).toBe(`${day}T14:00`)
    expect(toField().value).toBe(`${day}T22:00`)
  })

  it('lets the end still be set on its own afterwards', async () => {
    await openForm()
    const day = fromField().value.slice(0, 10)

    fireEvent.change(fromField(), { target: { value: `${day}T14:00` } })
    fireEvent.change(toField(), { target: { value: `${day}T15:30` } })

    expect(toField().value).toBe(`${day}T15:30`)
  })

  it('sends the shifted end when saving', async () => {
    const submit = await openForm()
    const day = fromField().value.slice(0, 10)

    fireEvent.change(fromField(), { target: { value: `${day}T14:00` } })
    fireEvent.click(submit)

    await vi.waitFor(() => expect(createBooking).toHaveBeenCalled())
    const sent = createBooking.mock.calls[0][0]
    expect(new Date(sent.startsAt).getHours()).toBe(14)
    expect(new Date(sent.endsAt).getHours()).toBe(22)
    expect(sent.userId).toBe(ANNA.id)
  })

  it('refuses an end before the start', async () => {
    const submit = await openForm()
    const day = fromField().value.slice(0, 10)

    fireEvent.change(toField(), { target: { value: `${day}T08:00` } })
    fireEvent.click(submit)

    expect(await screen.findByText(/Ende muss nach dem Beginn/)).toBeInTheDocument()
    expect(createBooking).not.toHaveBeenCalled()
  })
})
