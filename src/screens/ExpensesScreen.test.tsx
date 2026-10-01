import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExpenseDialog } from './ExpensesScreen'
import type { Car, Expense, Profile } from '../data/types'

/** Costs can be corrected by anyone in the family, not only deleted. */

const createExpense = vi.fn()
const updateExpense = vi.fn()
const deleteExpense = vi.fn()

const CARS: Car[] = [
  { id: 'car-1', name: 'VW Golf', licensePlate: null, initialOdometer: 0, active: true },
]
const ANNA: Profile = { id: 'user-anna', displayName: 'Anna', color: '#0f766e', active: true }
const BERND: Profile = { id: 'user-bernd', displayName: 'Bernd', color: '#b45309', active: true }

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    provider: { createExpense, updateExpense, deleteExpense },
    cars: CARS,
    profiles: [ANNA, BERND],
    user: { id: 'user-anna', email: 'anna@example.com' },
  }),
  useProfileLookup: () => (id: string) => [ANNA, BERND].find((p) => p.id === id) ?? null,
}))

const insurance: Expense = {
  id: 'e1',
  carId: 'car-1',
  userId: BERND.id,
  category: 'insurance',
  amountCents: 48_000,
  incurredOn: '2026-01-05',
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  liters: null,
  note: 'HUK',
  receiptPath: null,
  createdBy: BERND.id,
  updatedBy: null,
  updatedAt: null,
}

function open(expense?: Expense) {
  const onSaved = vi.fn()
  render(<ExpenseDialog expense={expense} onClose={vi.fn()} onSaved={onSaved} />)
  return { onSaved }
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement

beforeEach(() => {
  createExpense.mockReset().mockResolvedValue({ ok: true, value: insurance })
  updateExpense.mockReset().mockResolvedValue({ ok: true, value: insurance })
  deleteExpense.mockReset().mockResolvedValue({ ok: true, value: undefined })
})

describe('editing a cost', () => {
  it('prefills every field, including the spread period', () => {
    open(insurance)
    expect(field(/Betrag/).value).toBe('480,00')
    expect(field(/Bezahlt von/).value).toBe(BERND.id)
    expect(field(/Über einen Zeitraum/).checked).toBe(true)
    expect(field(/Zeitraum von/).value).toBe('2026-01-01')
    expect(field(/Notiz/).value).toBe('HUK')
  })

  it("keeps a saved cost's own spread setting when opened", () => {
    open({ ...insurance, category: 'tax', periodStart: null, periodEnd: null })
    expect(field(/Über einen Zeitraum/).checked).toBe(false)
  })

  it('saves a corrected amount for someone else', async () => {
    const { onSaved } = open(insurance)
    fireEvent.change(field(/Betrag/), { target: { value: '495,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateExpense).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ amountCents: 49_550, userId: BERND.id }),
    )
  })

  it('names the payer when deleting for everyone', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onSaved } = open(insurance)
    fireEvent.click(screen.getByRole('button', { name: 'Kosten für alle löschen' }))
    expect(confirmSpy.mock.calls[0][0]).toMatch(
      /KFZ-Versicherung über 480,00\s€, bezahlt von Bernd/,
    )
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(deleteExpense).toHaveBeenCalledWith('e1')
    confirmSpy.mockRestore()
  })
})

describe('adding a cost', () => {
  it('defaults the payer to yourself but lets you pick someone else', async () => {
    const { onSaved } = open()
    expect(field(/Bezahlt von/).value).toBe(ANNA.id)
    fireEvent.change(field(/Bezahlt von/), { target: { value: BERND.id } })
    fireEvent.change(field(/Betrag/), { target: { value: '54,90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BERND.id, amountCents: 5_490, category: 'fuel' }),
    )
  })

  it('suggests spreading when a yearly category is picked', () => {
    open()
    expect(field(/Über einen Zeitraum/).checked).toBe(false)
    fireEvent.change(field(/^Art/), { target: { value: 'tax' } })
    expect(field(/Über einen Zeitraum/).checked).toBe(true)
  })
})

describe('the sheet on a small screen', () => {
  // On an iPhone the long cost form overflowed above the top edge, where
  // nothing can scroll to, so the close button was unreachable.
  it('keeps the close button outside the scrolling body', () => {
    open(insurance)
    const body = screen.getByTestId('sheet-body')
    const close = screen.getByRole('button', { name: 'Schließen' })
    expect(body).toHaveClass('overflow-y-auto')
    expect(body).not.toContainElement(close)
    expect(body).toContainElement(screen.getByRole('button', { name: 'Kosten für alle löschen' }))
  })
})
