import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** A git value for the version line, or a fallback when git is unavailable. */
function git(command: string, fallback: string): string {
  try {
    const output = execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] })
    return output.toString().trim() || fallback
  } catch {
    return fallback
  }
}

// On GitHub Pages the app is served from /CarSharingApp/, locally from /.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  // Shown at the bottom of the "Mehr" screen.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(
      git('rev-parse --short HEAD', process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
    ),
    __GIT_AUTHOR__: JSON.stringify(git('log -1 --format=%an', 'unbekannt')),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Familien-Carsharing',
        short_name: 'Carsharing',
        description: 'Autos reservieren, Kilometer erfassen und Kosten teilen',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // Expose on the LAN so the app can be opened on a phone during development.
    host: true,
  },
  test: {
    // jsdom so component behaviour can be tested, not only pure functions.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
