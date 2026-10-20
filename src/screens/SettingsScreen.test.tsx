import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsScreen from './SettingsScreen'
import type { Car, Profile } from '../data/types'

/**
 * Cars are managed under "Mehr": each one is a fuel or an electric car, and a
 * sold car is disabled instead of deleted so its history stays intact.
 */

const createCar = vi.fn()
const updateCar = vi.fn()
const reload = vi.fn()

const GOLF: Car = {
  id: 'golf',
  name: 'VW Golf',
  licensePlate: 'B-AB 123',
  initialOdometer: 12_000,
  driveType: 'fuel',
  active: true,
}
const EUP: Car = { ...GOLF, id: 'eup', name: 'VW e-Up', licensePlate: null, driveType: 'electric' }
const PASSAT: Car = { ...GOLF, id: 'passat', name: 'Passat', licensePlate: null, active: false }

const ANNA: Profile = { id: 'user-anna', displayName: 'Anna', color: '#0f766e', active: true }

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider: { createCar, updateCar, updateSettings: vi.fn(), updateProfile: vi.fn() },
    profiles: [ANNA],
    cars: [PASSAT, GOLF, EUP],
    settings: { splitRule: 'fixed_equal_variable_km', currency: 'EUR' },
    me: ANNA,
    user: { id: ANNA.id, email: 'anna@example.com' },
    reload,
    signOut: vi.fn(),
  }),
}))

const confirmSpy = vi.spyOn(window, 'confirm')
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement
const carButton = (name: string) => screen.getByRole('button', { name: `${name} bearbeiten` })

beforeEach(() => {
  createCar.mockReset().mockResolvedValue({ ok: true, value: GOLF })
  updateCar.mockReset().mockResolvedValue({ ok: true, value: GOLF })
  reload.mockReset().mockResolvedValue(undefined)
  confirmSpy.mockReset().mockReturnValue(true)
})

afterEach(() => confirmSpy.mockReset())

describe('the car list', () => {
  it('lists cars in use first and marks electric and disabled cars', () => {
    render(<SettingsScreen />)
    const names = screen
      .getAllByRole('button', { name: / bearbeiten$/ })
      .map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['VW Golf bearbeiten', 'VW e-Up bearbeiten', 'Passat bearbeiten'])
    expect(carButton('VW e-Up')).toHaveTextContent('Elektro')
    expect(carButton('VW Golf')).not.toHaveTextContent('Elektro')
    expect(carButton('Passat')).toHaveTextContent('inaktiv')
    expect(carButton('VW Golf')).not.toHaveTextContent('inaktiv')
  })
})

describe('adding a car', () => {
  function fillIn(name: string) {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByRole('button', { name: '+ Auto' }))
    fireEvent.change(field(/^Name/), { target: { value: name } })
    fireEvent.change(field(/km-Stand jetzt/), { target: { value: '500' } })
  }

  it('adds a fuel car by default', async () => {
    fillIn('Opel Corsa')
    expect(field(/^Antrieb/).value).toBe('fuel')
    fireEvent.click(screen.getByRole('button', { name: 'Auto hinzufügen' }))
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(createCar).toHaveBeenCalledWith({
      name: 'Opel Corsa',
      licensePlate: null,
      initialOdometer: 500,
      driveType: 'fuel',
      active: true,
    })
  })

  it('adds an electric car', async () => {
    fillIn('Renault Zoe')
    fireEvent.change(field(/^Antrieb/), { target: { value: 'electric' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto hinzufügen' }))
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(createCar).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renault Zoe', driveType: 'electric', active: true }),
    )
  })
})

describe('editing a car', () => {
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

  it('prefills the car and only saves once something changed', () => {
    render(<SettingsScreen />)
    fireEvent.click(carButton('VW Golf'))
    expect(field(/^Name/).value).toBe('VW Golf')
    expect(field(/^Kennzeichen/).value).toBe('B-AB 123')
    expect(field(/^Antrieb/).value).toBe('fuel')
    expect(field(/Auto ist aktiv/).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Keine Änderungen' })).toBeDisabled()
  })

  it('changes the drive type', async () => {
    render(<SettingsScreen />)
    fireEvent.click(carButton('VW Golf'))
    fireEvent.change(field(/^Antrieb/), { target: { value: 'electric' } })
    save()
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(updateCar).toHaveBeenCalledWith(
      'golf',
      expect.objectContaining({ driveType: 'electric' }),
    )
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('disables a sold car after asking', async () => {
    render(<SettingsScreen />)
    fireEvent.click(carButton('VW Golf'))
    fireEvent.click(field(/Auto ist aktiv/))
    save()
    expect(confirmSpy.mock.calls[0][0]).toMatch(/VW Golf deaktivieren\?/)
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(updateCar).toHaveBeenCalledWith('golf', expect.objectContaining({ active: false }))
  })

  it('keeps the car when disabling is cancelled', () => {
    confirmSpy.mockReturnValue(false)
    render(<SettingsScreen />)
    fireEvent.click(carButton('VW Golf'))
    fireEvent.click(field(/Auto ist aktiv/))
    save()
    expect(updateCar).not.toHaveBeenCalled()
  })

  it('enables a disabled car again without asking', async () => {
    render(<SettingsScreen />)
    fireEvent.click(carButton('Passat'))
    expect(field(/Auto ist aktiv/).checked).toBe(false)
    fireEvent.click(field(/Auto ist aktiv/))
    save()
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    expect(updateCar).toHaveBeenCalledWith('passat', expect.objectContaining({ active: true }))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('shows the error and stays open when saving fails', async () => {
    updateCar.mockResolvedValue({ ok: false, reason: 'unknown', message: 'Keine Verbindung' })
    render(<SettingsScreen />)
    fireEvent.click(carButton('VW e-Up'))
    fireEvent.change(field(/^Name/), { target: { value: 'e-Up!' } })
    save()
    expect(await screen.findByText('Keine Verbindung')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
