import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookingDetail from './BookingDetail'
import type { Booking, Car, Profile } from '../data/types'

/**
 * The edit form is the one place where a reservation can be corrected, so every
 * field has to actually accept input and reach the provider.
 */

const updateBooking = vi.fn()
const deleteBooking = vi.fn()

const CARS: Car[] = [
  { id: 'car-1', name: 'VW Golf', licensePlate: null, initialOdometer: 0, active: true },
  { id: 'car-2', name: 'Opel Corsa', licensePlate: null, initialOdometer: 0, active: true },
]

const ANNA: Profile = { id: 'user-anna', displayName: 'Anna', color: '#0f766e', active: true }
const BERND: Profile = { id: 'user-bernd', displayName: 'Bernd', color: '#b45309', active: true }

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider: { updateBooking, deleteBooking },
    cars: CARS,
    user: { id: 'user-anna', email: 'anna@example.com' },
  }),
  useProfileLookup: () => (id: string) => [ANNA, BERND].find((p) => p.id === id) ?? null,
}))

const local = (h: number, m = 0, day = 21) => new Date(2026, 8, day, h, m).toISOString()

const booking: Booking = {
  id: 'b1',
  reference: 7,
  carId: 'car-1',
  userId: ANNA.id,
  startsAt: local(9),
  endsAt: local(17),
  purpose: 'Einkaufen',
}

function open(overrides: Partial<Booking> = {}) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const view = render(
    <BookingDetail booking={{ ...booking, ...overrides }} onClose={onClose} onChanged={onChanged} />,
  )
  return { ...view, onClose, onChanged }
}

const carField = () => screen.getByLabelText(/Auto/) as HTMLSelectElement
const fromField = () => screen.getByLabelText(/^Von/) as HTMLInputElement
const toField = () => screen.getByLabelText(/^Bis/) as HTMLInputElement
const purposeField = () => screen.getByLabelText(/Zweck/) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: /speichern|keine änderungen/i })

beforeEach(() => {
  updateBooking.mockReset().mockResolvedValue({ ok: true, value: booking })
  deleteBooking.mockReset().mockResolvedValue({ ok: true, value: undefined })
})

describe('editing your own reservation', () => {
  it('prefills every field from the booking', () => {
    open()
    expect(carField().value).toBe('car-1')
    expect(fromField().value).toBe('2026-09-21T09:00')
    expect(toField().value).toBe('2026-09-21T17:00')
    expect(purposeField().value).toBe('Einkaufen')
    expect(screen.getByText('Reservierung #7')).toBeInTheDocument()
  })

  it('starts with saving disabled because nothing differs yet', () => {
    open()
    expect(saveButton()).toBeDisabled()
  })

  it('lets the car be changed', () => {
    open()
    fireEvent.change(carField(), { target: { value: 'car-2' } })
    expect(carField().value).toBe('car-2')
    expect(saveButton()).toBeEnabled()
  })

  it('lets the start be changed', () => {
    open()
    fireEvent.change(fromField(), { target: { value: '2026-09-21T08:00' } })
    expect(fromField().value).toBe('2026-09-21T08:00')
    expect(saveButton()).toBeEnabled()
  })

  it('lets the end be changed', () => {
    open()
    fireEvent.change(toField(), { target: { value: '2026-09-21T19:30' } })
    expect(toField().value).toBe('2026-09-21T19:30')
    expect(saveButton()).toBeEnabled()
  })

  it('lets the purpose be changed', () => {
    open()
    fireEvent.change(purposeField(), { target: { value: 'Arbeit' } })
    expect(purposeField().value).toBe('Arbeit')
    expect(saveButton()).toBeEnabled()
  })

  it('recalculates the duration while the times change', () => {
    open()
    expect(screen.getByText('8 Std.')).toBeInTheDocument()
    fireEvent.change(toField(), { target: { value: '2026-09-21T12:30' } })
    expect(screen.getByText('3 Std. 30 Min.')).toBeInTheDocument()
  })

  it('sends every changed field to the provider', async () => {
    const { onChanged } = open()
    fireEvent.change(carField(), { target: { value: 'car-2' } })
    fireEvent.change(fromField(), { target: { value: '2026-09-22T10:00' } })
    fireEvent.change(toField(), { target: { value: '2026-09-22T14:00' } })
    fireEvent.change(purposeField(), { target: { value: 'Arbeit' } })

    fireEvent.click(saveButton())
    await vi.waitFor(() => expect(updateBooking).toHaveBeenCalledTimes(1))

    expect(updateBooking).toHaveBeenCalledWith('b1', {
      carId: 'car-2',
      startsAt: new Date(2026, 8, 22, 10, 0).toISOString(),
      endsAt: new Date(2026, 8, 22, 14, 0).toISOString(),
      purpose: 'Arbeit',
    })
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('refuses an end that is not after the start', async () => {
    open()
    fireEvent.change(toField(), { target: { value: '2026-09-21T08:00' } })
    fireEvent.click(saveButton())
    expect(await screen.findByText(/Ende muss nach dem Beginn/)).toBeInTheDocument()
    expect(updateBooking).not.toHaveBeenCalled()
  })

  it('shows the reason when the slot is already taken', async () => {
    updateBooking.mockResolvedValue({
      ok: false,
      reason: 'conflict',
      message: 'Dieses Auto ist in dem Zeitraum bereits reserviert.',
    })
    const { onChanged } = open()
    fireEvent.change(toField(), { target: { value: '2026-09-21T19:00' } })
    fireEvent.click(saveButton())

    expect(await screen.findByText(/bereits reserviert/)).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('empties the purpose to null rather than an empty string', async () => {
    open()
    fireEvent.change(purposeField(), { target: { value: '   ' } })
    fireEvent.click(saveButton())
    await vi.waitFor(() => expect(updateBooking).toHaveBeenCalled())
    expect(updateBooking.mock.calls[0][1].purpose).toBeNull()
  })
})

describe('closing the form', () => {
  it('does not close while a field is being used', () => {
    const { onClose } = open()
    fireEvent.click(purposeField())
    fireEvent.click(carField())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on the ✕ button', () => {
    const { onClose } = open()
    fireEvent.click(screen.getByRole('button', { name: /schließen/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps unsaved edits when the backdrop is tapped by accident', () => {
    const { container, onClose } = open()
    fireEvent.change(purposeField(), { target: { value: 'Arbeit' } })
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
    expect(purposeField().value).toBe('Arbeit')
  })
})

describe('someone else reservation', () => {
  it('is read-only', () => {
    open({ userId: BERND.id })
    expect(screen.queryByLabelText(/Zweck/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /löschen/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Nur Bernd kann diese Reservierung ändern/)).toBeInTheDocument()
  })
})

describe('the backdrop after a native picker closes', () => {
  it('ignores a click that arrives from a node the picker removed', () => {
    const { container, onClose } = open()

    // A date or select picker takes its overlay out of the DOM as it closes,
    // so the resulting click reaches the backdrop with a detached target.
    const detached = document.createElement('div')
    const backdrop = container.firstChild as HTMLElement
    const event = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(event, 'target', { value: detached })
    backdrop.dispatchEvent(event)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes on a deliberate backdrop tap when nothing was edited', () => {
    const { container, onClose } = open()
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the end field following the start', () => {
  it('shifts the end when the start moves, keeping the duration', () => {
    open()
    expect(toField().value).toBe('2026-09-21T17:00')

    fireEvent.change(fromField(), { target: { value: '2026-09-21T11:00' } })

    expect(fromField().value).toBe('2026-09-21T11:00')
    expect(toField().value).toBe('2026-09-21T19:00')
    // Still eight hours, so the duration on screen is unchanged.
    expect(screen.getByText('8 Std.')).toBeInTheDocument()
  })

  it('carries the end into the next day when the start moves late', () => {
    open()
    fireEvent.change(fromField(), { target: { value: '2026-09-21T20:00' } })
    expect(toField().value).toBe('2026-09-22T04:00')
  })

  it('leaves the end free to be set on its own afterwards', () => {
    open()
    fireEvent.change(fromField(), { target: { value: '2026-09-21T11:00' } })
    fireEvent.change(toField(), { target: { value: '2026-09-21T12:00' } })
    expect(toField().value).toBe('2026-09-21T12:00')
    expect(screen.getByText('1 Std.')).toBeInTheDocument()
  })

  it('sends the shifted end to the provider', async () => {
    open()
    fireEvent.change(fromField(), { target: { value: '2026-09-22T10:00' } })
    fireEvent.click(saveButton())
    await vi.waitFor(() => expect(updateBooking).toHaveBeenCalled())

    expect(updateBooking.mock.calls[0][1]).toMatchObject({
      startsAt: new Date(2026, 8, 22, 10, 0).toISOString(),
      endsAt: new Date(2026, 8, 22, 18, 0).toISOString(),
    })
  })
})
