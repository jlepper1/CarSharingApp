import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getProvider } from '../data'
import type { AuthUser, DataProvider } from '../data/DataProvider'
import type { Car, Profile, Settings } from '../data/types'

/**
 * Holds the signed-in user plus the reference data every screen needs
 * (family members, cars, split rule), so each screen only has to fetch the
 * bookings, trips or costs it actually shows.
 */

interface AppState {
  provider: DataProvider
  user: AuthUser | null
  /** The signed-in user's own profile row. */
  me: Profile | null
  profiles: Profile[]
  cars: Car[]
  settings: Settings | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

/** Thrown at startup when .env.local has not been filled in yet. */
export const ConfigContext = createContext<string | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const setup = useMemo(() => {
    try {
      return { provider: getProvider(), error: null as string | null }
    } catch (err) {
      return { provider: null, error: (err as Error).message }
    }
  }, [])

  const [user, setUser] = useState<AuthUser | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const provider = setup.provider

  // Follow the session: restores the login on app start and reacts to sign-out.
  useEffect(() => {
    if (!provider) {
      setLoading(false)
      return
    }
    let active = true

    provider
      .getCurrentUser()
      .then((current) => {
        if (active) setUser(current)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = provider.onAuthChange((next) => {
      if (active) setUser(next)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [provider])

  const reload = useCallback(async () => {
    if (!provider || !user) return
    setError(null)
    try {
      const [nextProfiles, nextCars, nextSettings] = await Promise.all([
        provider.listProfiles(),
        provider.listCars(),
        provider.getSettings(),
      ])
      setProfiles(nextProfiles)
      setCars(nextCars)
      setSettings(nextSettings)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [provider, user])

  // Reference data is only readable once signed in, so load it after login.
  useEffect(() => {
    if (user) {
      void reload()
    } else {
      setProfiles([])
      setCars([])
      setSettings(null)
    }
  }, [user, reload])

  const signOut = useCallback(async () => {
    await provider?.signOut()
    setUser(null)
  }, [provider])

  const value = useMemo<AppState | null>(() => {
    if (!provider) return null
    return {
      provider,
      user,
      me: profiles.find((p) => p.id === user?.id) ?? null,
      profiles,
      cars,
      settings,
      loading,
      error,
      reload,
      signOut,
    }
  }, [provider, user, profiles, cars, settings, loading, error, reload, signOut])

  return (
    <ConfigContext.Provider value={setup.error}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </ConfigContext.Provider>
  )
}

export function useApp(): AppState {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp muss innerhalb von AppProvider verwendet werden')
  return context
}

export function useConfigError(): string | null {
  return useContext(ConfigContext)
}

/** Look up a family member's display name and colour by id. */
export function useProfileLookup() {
  const { profiles } = useApp()
  return useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p]))
    return (id: string) => map.get(id) ?? null
  }, [profiles])
}
