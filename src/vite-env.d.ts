/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DATA_PROVIDER?: 'supabase'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected at build time by vite.config.ts.
declare const __APP_VERSION__: string
declare const __GIT_HASH__: string
declare const __GIT_AUTHOR__: string
