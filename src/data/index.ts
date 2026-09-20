import type { DataProvider } from './DataProvider'
import { SupabaseProvider } from './supabase/SupabaseProvider'

/**
 * Picks the storage backend. Adding OneDrive later means adding a case here
 * and a new file next to SupabaseProvider - nothing in the UI changes.
 */
let provider: DataProvider | null = null

export function getProvider(): DataProvider {
  if (provider) return provider

  const choice = import.meta.env.VITE_DATA_PROVIDER ?? 'supabase'
  switch (choice) {
    case 'supabase':
    default:
      provider = new SupabaseProvider()
      return provider
  }
}

export type { DataProvider }
