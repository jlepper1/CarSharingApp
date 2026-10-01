import type { ReactNode } from 'react'
import { useProfileLookup } from '../context/AppContext'
import type { Audit, Profile, UUID } from '../data/types'

/**
 * Bottom sheet used for every entry that opens on tap: reservations, trips
 * and costs. Holds the close rules all three share.
 */
export function Sheet({
  title,
  kicker,
  label,
  dirty,
  onClose,
  children,
}: {
  title: string
  /** Small line above the title, e.g. "Reservierung #7". */
  kicker?: string
  /** Accessible name of the dialog; defaults to the title. */
  label?: string
  /** Something was typed but not saved yet. */
  dirty: boolean
  onClose: () => void
  children: ReactNode
}) {
  /**
   * Only a tap on the backdrop itself closes the sheet.
   *
   * Relying on the dialog to stop the click from bubbling is not enough: a
   * native date or select picker removes the element under the finger as it
   * closes, so the click arrives at the backdrop from a node that is no longer
   * inside the dialog. On a phone that made every attempt to change a field
   * shut the form instead.
   */
  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    // Never throw away something that has been typed but not saved.
    if (dirty) return
    onClose()
  }

  function handleCloseButton() {
    if (dirty && !confirm('Änderungen verwerfen?')) return
    onClose()
  }

  /*
   * The sheet is never taller than the visible screen: the header with ✕ stays
   * put and only the body scrolls. Letting the whole sheet overflow does not
   * work - aligned to the bottom, a sheet taller than the screen sticks out
   * above the top edge, where no scrolling can reach, and on an iPhone that
   * hid the close button of the long cost form.
   */
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-label={label ?? title}
        className="sheet-max-h flex w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            {kicker ? (
              <span className="text-xs font-medium tabular-nums text-slate-400">{kicker}</span>
            ) : null}
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={handleCloseButton}
            aria-label="Schließen"
            className="-mr-1 -mt-1 px-2 py-1 text-slate-400"
          >
            ✕
          </button>
        </div>
        <div
          data-testid="sheet-body"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 safe-bottom"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

const changedFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** "Eingetragen von Anna · zuletzt geändert von Bernd am 03.10.2026". */
export function AuditNote({ audit }: { audit: Audit }) {
  const lookup = useProfileLookup()
  const name = (id: UUID | null) => (id ? (lookup(id)?.displayName ?? 'Unbekannt') : null)

  const parts: string[] = []
  const creator = name(audit.createdBy)
  if (creator) parts.push(`Eingetragen von ${creator}`)
  const editor = name(audit.updatedBy)
  if (editor && audit.updatedAt) {
    parts.push(
      `zuletzt geändert von ${editor} am ${changedFormat.format(new Date(audit.updatedAt))}`,
    )
  }
  if (parts.length === 0) return null

  return <p className="mt-4 text-center text-xs text-slate-400">{parts.join(' · ')}</p>
}

/** Tap-to-toggle chips for choosing several family members. */
export function PersonPicker({
  people,
  selected,
  onChange,
  meId,
}: {
  people: Profile[]
  selected: UUID[]
  onChange: (next: UUID[]) => void
  meId?: UUID
}) {
  function toggle(id: UUID) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {people.map((person) => {
        const active = selected.includes(person.id)
        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(person.id)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
              active
                ? 'border-brand-600 bg-brand-50 font-medium text-brand-900'
                : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: person.color }}
            />
            {person.displayName}
            {person.id === meId ? ' (du)' : ''}
          </button>
        )
      })}
    </div>
  )
}

/** "Anna", "Anna und Bernd", "Anna, Bernd und Carla". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
}
