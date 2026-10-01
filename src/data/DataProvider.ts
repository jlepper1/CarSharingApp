import type {
  Audit,
  Booking,
  Car,
  Expense,
  ISODate,
  Profile,
  Settings,
  Trip,
  UUID,
} from './types'

/**
 * The contract every storage backend must satisfy.
 *
 * No screen may import `@supabase/supabase-js` directly — screens talk to this
 * interface only. Moving the family's data to OneDrive later then means writing
 * one new file that implements `DataProvider`, without touching the UI.
 */

export interface AuthUser {
  id: UUID
  email: string
}

/** Inclusive day range used by every list query. */
export interface DateRange {
  from: ISODate
  to: ISODate
}

export type SaveFailureReason = 'conflict' | 'auth' | 'validation' | 'unknown'

/**
 * Result of a write.
 *
 * `conflict` matters most: Supabase gets it from a database exclusion
 * constraint, so a double booking is impossible. A future OneDrive provider
 * could only check for overlaps on the client before writing, which is
 * best-effort. Either way the UI handles the same shape.
 */
export type SaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: SaveFailureReason; message: string }

export type NewCar = Omit<Car, 'id'>
// The database assigns the reference number and the audit trail, so callers
// never supply them.
export type NewBooking = Omit<Booking, 'id' | 'reference' | keyof Audit>
export type NewTrip = Omit<Trip, 'id' | 'distanceKm' | keyof Audit>
export type NewExpense = Omit<Expense, 'id' | keyof Audit>

/** Outcome of leaving a trip: the last person out deletes it. */
export type LeaveTripOutcome = 'left' | 'deleted' | 'not_participant'

export interface DataProvider {
  // --- authentication ---
  getCurrentUser(): Promise<AuthUser | null>
  /** Returns an unsubscribe function. */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void
  signIn(email: string, password: string): Promise<SaveResult<AuthUser>>
  signOut(): Promise<void>

  // --- reference data ---
  listProfiles(): Promise<Profile[]>
  listCars(): Promise<Car[]>
  createCar(car: NewCar): Promise<SaveResult<Car>>
  updateCar(id: UUID, patch: Partial<NewCar>): Promise<SaveResult<Car>>
  /** Each member may only edit their own name and colour. */
  updateProfile(
    id: UUID,
    patch: Partial<Pick<Profile, 'displayName' | 'color'>>,
  ): Promise<SaveResult<Profile>>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<SaveResult<Settings>>

  // --- bookings ---
  listBookings(range: DateRange): Promise<Booking[]>
  createBooking(booking: NewBooking): Promise<SaveResult<Booking>>
  updateBooking(id: UUID, patch: Partial<NewBooking>): Promise<SaveResult<Booking>>
  deleteBooking(id: UUID): Promise<SaveResult<void>>

  // --- trips ---
  listTrips(range: DateRange): Promise<Trip[]>
  /**
   * Highest odometer reading recorded for a car, falling back to the car's
   * initial reading. Used to pre-fill the start of the next trip so gaps
   * become visible instead of silently disappearing.
   */
  getLastOdometer(carId: UUID): Promise<number>
  createTrip(trip: NewTrip): Promise<SaveResult<Trip>>
  updateTrip(id: UUID, patch: Partial<NewTrip>): Promise<SaveResult<Trip>>
  /** Remove the signed-in user from a trip; deletes it if nobody is left. */
  leaveTrip(id: UUID): Promise<SaveResult<LeaveTripOutcome>>
  deleteTrip(id: UUID): Promise<SaveResult<void>>

  // --- expenses ---
  listExpenses(range: DateRange): Promise<Expense[]>
  createExpense(expense: NewExpense): Promise<SaveResult<Expense>>
  updateExpense(id: UUID, patch: Partial<NewExpense>): Promise<SaveResult<Expense>>
  deleteExpense(id: UUID): Promise<SaveResult<void>>
}
