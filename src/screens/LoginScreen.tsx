import { useState, type FormEvent } from 'react'
import { Button, ErrorBanner, Field, Input } from '../components/ui'
import { useApp } from '../context/AppContext'

export default function LoginScreen() {
  const { provider } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await provider.signIn(email.trim(), password)
    if (!result.ok) setError(result.message)
    setBusy(false)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-5 py-10 safe-top">
      <div className="mb-8 text-center">
        <div aria-hidden className="mb-2 text-4xl">
          🚗
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Familien-Carsharing</h1>
        <p className="mt-1 text-sm text-slate-600">Autos reservieren und Kosten teilen</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorBanner message={error} />

        <Field label="E-Mail">
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Passwort">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Anmelden …' : 'Anmelden'}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Zugänge werden von der Familie angelegt. Eine Selbstregistrierung gibt es nicht.
      </p>
    </div>
  )
}
