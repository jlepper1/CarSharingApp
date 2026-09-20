import { useEffect, useState, type FormEvent } from 'react'
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Screen,
  Spinner,
} from '../components/ui'
import { useApp } from '../context/AppContext'
import {
  SPLIT_RULE_DESCRIPTIONS,
  SPLIT_RULE_LABELS,
  type SplitRule,
} from '../data/types'
import { formatKm } from '../lib/format'

const RULES: SplitRule[] = ['fixed_equal_variable_km', 'all_by_km', 'all_equal']

const COLORS = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#15803d', '#a16207']

export default function SettingsScreen() {
  const { provider, profiles, settings, me, user, reload, signOut } = useApp()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function chooseRule(rule: SplitRule) {
    setSaving(true)
    setError(null)
    const result = await provider.updateSettings({ splitRule: rule })
    if (!result.ok) setError(result.message)
    else await reload()
    setSaving(false)
  }

  if (!settings) return <Spinner />

  return (
    <Screen title="Mehr">
      <ErrorBanner message={error} />

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Kostenverteilung</h2>
      <div className="mb-5 space-y-2">
        {RULES.map((rule) => {
          const active = settings.splitRule === rule
          return (
            <button
              key={rule}
              onClick={() => void chooseRule(rule)}
              disabled={saving}
              className={`block w-full rounded-xl border p-4 text-left transition-colors ${
                active
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-slate-200 bg-white active:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    active ? 'border-brand-700' : 'border-slate-400'
                  }`}
                >
                  {active ? <span className="h-2 w-2 rounded-full bg-brand-700" /> : null}
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    {SPLIT_RULE_LABELS[rule]}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {SPLIT_RULE_DESCRIPTIONS[rule]}
                  </span>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <CarSection />

      <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-700">Familie</h2>
      <Card className="mb-5">
        <ul className="space-y-2">
          {profiles.map((profile) => (
            <li key={profile.id} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: profile.color }}
              />
              <span className="flex-1 text-slate-700">
                {profile.displayName}
                {profile.id === user?.id ? ' (du)' : ''}
              </span>
              {!profile.active ? (
                <span className="text-xs text-slate-400">inaktiv</span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
          Neue Zugänge legt ihr im Supabase-Dashboard an (Authentication → Add user).
        </p>
      </Card>

      {me ? <ProfileSection /> : null}

      <Button variant="secondary" className="mt-6 w-full" onClick={() => void signOut()}>
        Abmelden
      </Button>
    </Screen>
  )
}

function CarSection() {
  const { provider, cars, reload } = useApp()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [odometer, setOdometer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const initial = Number(odometer)
    if (!Number.isInteger(initial) || initial < 0) {
      setError('Bitte einen gültigen Kilometerstand eintragen.')
      return
    }

    setBusy(true)
    setError(null)
    const result = await provider.createCar({
      name: name.trim(),
      licensePlate: plate.trim() || null,
      initialOdometer: initial,
      active: true,
    })
    setBusy(false)

    if (result.ok) {
      setName('')
      setPlate('')
      setOdometer('')
      setAdding(false)
      await reload()
    } else {
      setError(result.message)
    }
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Autos</h2>
        <button onClick={() => setAdding((v) => !v)} className="text-xs font-medium text-brand-700">
          {adding ? 'Abbrechen' : '+ Auto'}
        </button>
      </div>

      <Card>
        {cars.length === 0 ? (
          <p className="text-sm text-slate-500">Noch kein Auto angelegt.</p>
        ) : (
          <ul className="space-y-2">
            {cars.map((car) => (
              <li key={car.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-slate-700">
                  {car.name}
                  {car.licensePlate ? (
                    <span className="ml-1 text-xs text-slate-400">{car.licensePlate}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  Start {formatKm(car.initialOdometer)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <ErrorBanner message={error} />
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VW Golf"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kennzeichen">
                <Input value={plate} onChange={(e) => setPlate(e.target.value)} />
              </Field>
              <Field label="km-Stand jetzt">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Speichern …' : 'Auto hinzufügen'}
            </Button>
          </form>
        ) : null}
      </Card>
    </>
  )
}

function ProfileSection() {
  const { provider, me, reload } = useApp()
  const [displayName, setDisplayName] = useState(me?.displayName ?? '')
  const [color, setColor] = useState(me?.color ?? COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDisplayName(me?.displayName ?? '')
    setColor(me?.color ?? COLORS[0])
  }, [me])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!me) return

    setBusy(true)
    setError(null)
    const result = await provider.updateProfile(me.id, { displayName: displayName.trim(), color })
    setBusy(false)

    if (result.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await reload()
    } else {
      setError(result.message)
    }
  }

  return (
    <>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Mein Profil</h2>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-3">
          <ErrorBanner message={error} />
          <Field label="Anzeigename">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Field label="Farbe im Kalender">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={`Farbe ${option}`}
                  className={`h-9 w-9 rounded-full border-2 transition-transform ${
                    color === option ? 'scale-110 border-slate-900' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Speichern …' : saved ? 'Gespeichert ✓' : 'Profil speichern'}
          </Button>
        </form>
      </Card>
    </>
  )
}
