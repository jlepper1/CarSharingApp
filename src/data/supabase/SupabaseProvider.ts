import {
  createClient,
  type AuthError,
  type PostgrestError,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type {
  AuthUser,
  DataProvider,
  DateRange,
  NewBooking,
  NewCar,
  NewExpense,
  NewTrip,
  SaveResult,
} from '../DataProvider'
import type {
  Booking,
  Car,
  Expense,
  ISODate,
  Profile,
  Settings,
  Trip,
  UUID,
} from '../types'

/**
 * Supabase (Postgres) implementation of DataProvider.
 *
 * This is the only file in the app that knows Supabase exists. Screens import
 * the DataProvider interface instead, so swapping the backend later means
 * adding a sibling of this file, not touching the UI.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/** `YYYY-MM-DD` to the instant that day begins, in the phone's own timezone. */
function dayStart(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
}

/** The instant the day *after* `date` begins, for exclusive upper bounds. */
function dayAfter(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString()
}

/** Turn a Postgres error into something a family member can actually read. */
function toFailure(error: PostgrestError): { ok: false; reason: never | 'conflict' | 'auth' | 'validation' | 'unknown'; message: string } {
  switch (error.code) {
    case '23P01': // exclusion_violation - the bookings_no_overlap constraint
      return {
        ok: false,
        reason: 'conflict',
        message: 'Dieses Auto ist in dem Zeitraum bereits reserviert.',
      }
    case '23514': // check_violation
      return {
        ok: false,
        reason: 'validation',
        message: 'Die Eingaben sind nicht gültig. Bitte prüfe Datum und Kilometerstand.',
      }
    case '42501': // insufficient_privilege - a row level security policy said no
      return {
        ok: false,
        reason: 'auth',
        message: 'Dafür fehlt die Berechtigung. Eigene Einträge kannst nur du selbst ändern.',
      }
    default:
      return { ok: false, reason: 'unknown', message: error.message }
  }
}

/**
 * Say why a sign-in actually failed.
 *
 * Collapsing every failure into "wrong password" hides the common real causes -
 * an account that was never confirmed, or email logins switched off in the
 * Supabase project - and sends people hunting for a typo that is not there.
 */
function signInMessage(error: AuthError | null): string {
  if (!error) return 'Anmeldung fehlgeschlagen. Bitte noch einmal versuchen.'

  switch (error.code) {
    case 'invalid_credentials':
      return 'E-Mail oder Passwort stimmt nicht.'
    case 'email_not_confirmed':
      return 'Dieser Zugang ist noch nicht bestätigt. Im Supabase-Dashboard unter Authentication → Users den Benutzer bestätigen (Confirm email).'
    case 'email_provider_disabled':
      return 'Anmeldung per E-Mail ist im Supabase-Projekt deaktiviert. Unter Authentication → Sign In / Providers → Email einschalten.'
    case 'user_not_found':
      return 'Für diese E-Mail gibt es keinen Zugang. Er wird im Supabase-Dashboard angelegt.'
    case 'user_banned':
      return 'Dieser Zugang ist gesperrt.'
    case 'over_request_rate_limit':
      return 'Zu viele Versuche. Bitte ein paar Minuten warten.'
    default:
      break
  }

  // No code at all usually means the request never reached Supabase: wrong URL
  // in .env.local, or no connection.
  if (!error.status) {
    return `Keine Verbindung zu Supabase. Bitte VITE_SUPABASE_URL in .env.local prüfen. (${error.message})`
  }
  return `Anmeldung fehlgeschlagen: ${error.message}`
}

type Row = Record<string, unknown>

function toProfile(row: Row): Profile {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    color: row.color as string,
    active: row.active as boolean,
  }
}

function toCar(row: Row): Car {
  return {
    id: row.id as string,
    name: row.name as string,
    licensePlate: (row.license_plate as string | null) ?? null,
    initialOdometer: row.initial_odometer as number,
    active: row.active as boolean,
  }
}

function toBooking(row: Row): Booking {
  return {
    id: row.id as string,
    carId: row.car_id as string,
    userId: row.user_id as string,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    purpose: (row.purpose as string | null) ?? null,
  }
}

function toTrip(row: Row): Trip {
  return {
    id: row.id as string,
    carId: row.car_id as string,
    userId: row.user_id as string,
    bookingId: (row.booking_id as string | null) ?? null,
    drivenOn: row.driven_on as string,
    odometerStart: row.odometer_start as number,
    odometerEnd: row.odometer_end as number,
    distanceKm: row.distance_km as number,
    note: (row.note as string | null) ?? null,
  }
}

function toExpense(row: Row): Expense {
  return {
    id: row.id as string,
    carId: (row.car_id as string | null) ?? null,
    userId: row.user_id as string,
    category: row.category as Expense['category'],
    amountCents: row.amount_cents as number,
    incurredOn: row.incurred_on as string,
    periodStart: (row.period_start as string | null) ?? null,
    periodEnd: (row.period_end as string | null) ?? null,
    liters: row.liters === null || row.liters === undefined ? null : Number(row.liters),
    note: (row.note as string | null) ?? null,
    receiptPath: (row.receipt_path as string | null) ?? null,
  }
}

function bookingToRow(booking: Partial<NewBooking>): Row {
  const row: Row = {}
  if (booking.carId !== undefined) row.car_id = booking.carId
  if (booking.userId !== undefined) row.user_id = booking.userId
  if (booking.startsAt !== undefined) row.starts_at = booking.startsAt
  if (booking.endsAt !== undefined) row.ends_at = booking.endsAt
  if (booking.purpose !== undefined) row.purpose = booking.purpose
  return row
}

function tripToRow(trip: Partial<NewTrip>): Row {
  const row: Row = {}
  if (trip.carId !== undefined) row.car_id = trip.carId
  if (trip.userId !== undefined) row.user_id = trip.userId
  if (trip.bookingId !== undefined) row.booking_id = trip.bookingId
  if (trip.drivenOn !== undefined) row.driven_on = trip.drivenOn
  if (trip.odometerStart !== undefined) row.odometer_start = trip.odometerStart
  if (trip.odometerEnd !== undefined) row.odometer_end = trip.odometerEnd
  if (trip.note !== undefined) row.note = trip.note
  return row
}

function expenseToRow(expense: Partial<NewExpense>): Row {
  const row: Row = {}
  if (expense.carId !== undefined) row.car_id = expense.carId
  if (expense.userId !== undefined) row.user_id = expense.userId
  if (expense.category !== undefined) row.category = expense.category
  if (expense.amountCents !== undefined) row.amount_cents = expense.amountCents
  if (expense.incurredOn !== undefined) row.incurred_on = expense.incurredOn
  if (expense.periodStart !== undefined) row.period_start = expense.periodStart
  if (expense.periodEnd !== undefined) row.period_end = expense.periodEnd
  if (expense.liters !== undefined) row.liters = expense.liters
  if (expense.note !== undefined) row.note = expense.note
  if (expense.receiptPath !== undefined) row.receipt_path = expense.receiptPath
  return row
}

export class SupabaseProvider implements DataProvider {
  private client: SupabaseClient

  constructor(url = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY) {
    if (!url || !anonKey) {
      throw new Error(
        'VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen. Lege eine .env.local nach dem Vorbild von .env.example an.',
      )
    }
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }

  // --- authentication ---

  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession()
    const user = data.session?.user
    return user ? { id: user.id, email: user.email ?? '' } : null
  }

  onAuthChange(callback: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      callback(user ? { id: user.id, email: user.email ?? '' } : null)
    })
    return () => data.subscription.unsubscribe()
  }

  async signIn(email: string, password: string): Promise<SaveResult<AuthUser>> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      return { ok: false, reason: 'auth', message: signInMessage(error) }
    }
    return { ok: true, value: { id: data.user.id, email: data.user.email ?? '' } }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
  }

  // --- reference data ---

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .order('display_name')
    if (error) throw new Error(error.message)
    return (data ?? []).map(toProfile)
  }

  async listCars(): Promise<Car[]> {
    const { data, error } = await this.client.from('cars').select('*').order('name')
    if (error) throw new Error(error.message)
    return (data ?? []).map(toCar)
  }

  async createCar(car: NewCar): Promise<SaveResult<Car>> {
    const { data, error } = await this.client
      .from('cars')
      .insert({
        name: car.name,
        license_plate: car.licensePlate,
        initial_odometer: car.initialOdometer,
        active: car.active,
      })
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toCar(data) }
  }

  async updateCar(id: UUID, patch: Partial<NewCar>): Promise<SaveResult<Car>> {
    const row: Row = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.licensePlate !== undefined) row.license_plate = patch.licensePlate
    if (patch.initialOdometer !== undefined) row.initial_odometer = patch.initialOdometer
    if (patch.active !== undefined) row.active = patch.active

    const { data, error } = await this.client
      .from('cars')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toCar(data) }
  }

  async updateProfile(
    id: UUID,
    patch: Partial<Pick<Profile, 'displayName' | 'color'>>,
  ): Promise<SaveResult<Profile>> {
    const row: Row = {}
    if (patch.displayName !== undefined) row.display_name = patch.displayName
    if (patch.color !== undefined) row.color = patch.color

    const { data, error } = await this.client
      .from('profiles')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toProfile(data) }
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.client
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) throw new Error(error.message)
    return { splitRule: data.split_rule, currency: data.currency }
  }

  async updateSettings(patch: Partial<Settings>): Promise<SaveResult<Settings>> {
    const row: Row = {}
    if (patch.splitRule !== undefined) row.split_rule = patch.splitRule
    if (patch.currency !== undefined) row.currency = patch.currency

    const { data, error } = await this.client
      .from('settings')
      .update(row)
      .eq('id', 1)
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: { splitRule: data.split_rule, currency: data.currency } }
  }

  // --- bookings ---

  async listBookings(range: DateRange): Promise<Booking[]> {
    // Any booking that overlaps the window, not only ones starting inside it.
    const { data, error } = await this.client
      .from('bookings')
      .select('*')
      .lt('starts_at', dayAfter(range.to))
      .gt('ends_at', dayStart(range.from))
      .order('starts_at')
    if (error) throw new Error(error.message)
    return (data ?? []).map(toBooking)
  }

  async createBooking(booking: NewBooking): Promise<SaveResult<Booking>> {
    const { data, error } = await this.client
      .from('bookings')
      .insert(bookingToRow(booking))
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toBooking(data) }
  }

  async updateBooking(id: UUID, patch: Partial<NewBooking>): Promise<SaveResult<Booking>> {
    const { data, error } = await this.client
      .from('bookings')
      .update(bookingToRow(patch))
      .eq('id', id)
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toBooking(data) }
  }

  async deleteBooking(id: UUID): Promise<SaveResult<void>> {
    const { error } = await this.client.from('bookings').delete().eq('id', id)
    if (error) return toFailure(error)
    return { ok: true, value: undefined }
  }

  // --- trips ---

  async listTrips(range: DateRange): Promise<Trip[]> {
    const { data, error } = await this.client
      .from('trips')
      .select('*')
      .gte('driven_on', range.from)
      .lte('driven_on', range.to)
      .order('driven_on', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(toTrip)
  }

  async getLastOdometer(carId: UUID): Promise<number> {
    const { data, error } = await this.client
      .from('trips')
      .select('odometer_end')
      .eq('car_id', carId)
      .order('odometer_end', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    if (data && data.length > 0) return data[0].odometer_end as number

    // No trips logged yet, so fall back to the reading the car started with.
    const { data: car, error: carError } = await this.client
      .from('cars')
      .select('initial_odometer')
      .eq('id', carId)
      .single()
    if (carError) throw new Error(carError.message)
    return (car?.initial_odometer as number) ?? 0
  }

  async createTrip(trip: NewTrip): Promise<SaveResult<Trip>> {
    const { data, error } = await this.client
      .from('trips')
      .insert(tripToRow(trip))
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toTrip(data) }
  }

  async updateTrip(id: UUID, patch: Partial<NewTrip>): Promise<SaveResult<Trip>> {
    const { data, error } = await this.client
      .from('trips')
      .update(tripToRow(patch))
      .eq('id', id)
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toTrip(data) }
  }

  async deleteTrip(id: UUID): Promise<SaveResult<void>> {
    const { error } = await this.client.from('trips').delete().eq('id', id)
    if (error) return toFailure(error)
    return { ok: true, value: undefined }
  }

  // --- expenses ---

  async listExpenses(range: DateRange): Promise<Expense[]> {
    // A yearly premium paid before this window still accrues into it, so match
    // on the covered period as well as the payment date.
    const { data, error } = await this.client
      .from('expenses')
      .select('*')
      .or(
        `and(incurred_on.gte.${range.from},incurred_on.lte.${range.to}),` +
          `and(period_start.lte.${range.to},period_end.gte.${range.from})`,
      )
      .order('incurred_on', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(toExpense)
  }

  async createExpense(expense: NewExpense): Promise<SaveResult<Expense>> {
    const { data, error } = await this.client
      .from('expenses')
      .insert(expenseToRow(expense))
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toExpense(data) }
  }

  async updateExpense(id: UUID, patch: Partial<NewExpense>): Promise<SaveResult<Expense>> {
    const { data, error } = await this.client
      .from('expenses')
      .update(expenseToRow(patch))
      .eq('id', id)
      .select()
      .single()
    if (error) return toFailure(error)
    return { ok: true, value: toExpense(data) }
  }

  async deleteExpense(id: UUID): Promise<SaveResult<void>> {
    const { error } = await this.client.from('expenses').delete().eq('id', id)
    if (error) return toFailure(error)
    return { ok: true, value: undefined }
  }
}
