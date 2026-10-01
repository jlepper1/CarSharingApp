import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDialog } from './TripsScreen'
import type { Car, Profile, Trip } from '../data/types'

/**
 * A trip can belong to several people with equal rights, and anyone in the
 * family may correct or delete it.
 */

const createTrip = vi.fn()
const updateTrip = vi.fn()
const deleteTrip = vi.fn()
const leaveTrip = vi.fn()
const getLastOdometer = vi.fn()

const CARS: Car[] = [
  { id: 'car-1', name: 'VW Golf', licensePlate: null, initialOdometer: 0, active: true },
]
const ANNA: Profile = { id: 'user-anna', displayName: 'Anna', color: '#0f766e', active: true }
const BERND: Profile = { id: 'user-bernd', displayName: 'Bernd', color: '#b45309', active: true }
const CARLA: Profile = { id: 'user-carla', displayName: 'Carla', color: '#7c3aed', active: true }
const PEOPLE = [ANNA, BERND, CARLA]

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider: { createTrip, updateTrip, deleteTrip, leaveTrip, getLastOdometer },
    cars: CARS,
    profiles: PEOPLE,
    user: { id: 'user-anna', email: 'anna@example.com' },
  }),
  useProfileLookup: () => (id: string) => PEOPLE.find((p) => p.id === id) ?? null,
}))

const saved: Trip = {
  id: 't1',
  carId: 'car-1',
  participantIds: [ANNA.id, BERND.id],
  bookingId: null,
  drivenOn: '2026-07-10',
  odometerStart: 1000,
  odometerEnd: 1090,
  distanceKm: 90,
  note: null,
  createdBy: BERND.id,
  updatedBy: null,
  updatedAt: null,
}

function open(trip?: Trip) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<TripDialog trip={trip} onClose={onClose} onSaved={onSaved} />)
  return { onClose, onSaved }
}

const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const confirmSpy = vi.spyOn(window, 'confirm')

beforeEach(() => {
  createTrip.mockReset().mockResolvedValue({ ok: true, value: saved })
  updateTrip.mockReset().mockResolvedValue({ ok: true, value: saved })
  deleteTrip.mockReset().mockResolvedValue({ ok: true, value: undefined })
  leaveTrip.mockReset().mockResolvedValue({ ok: true, value: 'left' })
  getLastOdometer.mockReset().mockResolvedValue(1090)
  confirmSpy.mockReset().mockReturnValue(true)
})

afterEach(() => confirmSpy.mockReset())

describe('adding a trip', () => {
  it('starts with yourself selected and saves the chosen people', async () => {
    const { onSaved } = open()
    expect(chip('Anna')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(chip('Carla'))
    await vi.waitFor(() =>
      expect((screen.getByLabelText('km-Stand Start') as HTMLInputElement).value).toBe('1090'),
    )
    fireEvent.change(screen.getByLabelText('km-Stand Ende'), { target: { value: '1150' } })
    expect(screen.getByText(/je Person 30 km/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        participantIds: [ANNA.id, CARLA.id],
        odometerStart: 1090,
        odometerEnd: 1150,
      }),
    )
  })

  it('refuses a trip without anyone on it', () => {
    open()
    fireEvent.click(chip('Anna'))
    fireEvent.change(screen.getByLabelText('km-Stand Start'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('km-Stand Ende'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.getByText('Bitte mindestens eine Person auswählen.')).toBeInTheDocument()
    expect(createTrip).not.toHaveBeenCalled()
  })
})

describe('editing a trip', () => {
  it('keeps the stored readings instead of the last odometer', () => {
    open(saved)
    expect((screen.getByLabelText('km-Stand Start') as HTMLInputElement).value).toBe('1000')
    expect(getLastOdometer).not.toHaveBeenCalled()
  })

  it('saves added people', async () => {
    const { onSaved } = open(saved)
    fireEvent.click(chip('Carla'))
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateTrip).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ participantIds: [ANNA.id, BERND.id, CARLA.id] }),
    )
  })

  it('lets a participant leave the trip', async () => {
    const { onSaved } = open(saved)
    fireEvent.click(screen.getByRole('button', { name: 'Mich austragen' }))
    expect(confirmSpy).toHaveBeenCalledWith('Dich aus dieser Fahrt austragen?')
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(leaveTrip).toHaveBeenCalledWith('t1')
  })

  it('warns the last person that leaving deletes the trip', () => {
    open({ ...saved, participantIds: [ANNA.id] })
    fireEvent.click(screen.getByRole('button', { name: 'Mich austragen' }))
    expect(confirmSpy).toHaveBeenCalledWith(
      'Du bist die letzte Person – die Fahrt wird gelöscht. Fortfahren?',
    )
  })

  it('lets anyone delete it for everyone, naming who is affected', async () => {
    const { onSaved } = open({ ...saved, participantIds: [BERND.id, CARLA.id] })
    expect(screen.queryByRole('button', { name: 'Mich austragen' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fahrt für alle löschen' }))
    expect(confirmSpy).toHaveBeenCalledWith('Fahrt von Bernd und Carla (90 km) für alle löschen?')
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(deleteTrip).toHaveBeenCalledWith('t1')
  })

  it('shows who entered the trip', () => {
    open(saved)
    expect(screen.getByText('Eingetragen von Bernd')).toBeInTheDocument()
  })
})
