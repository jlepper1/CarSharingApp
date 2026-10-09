import type { Car, Profile, SettlementPayment, Trip, UUID } from '../data/types'
import { CATEGORY_LABELS, SPLIT_RULE_LABELS } from '../data/types'
import { formatDateISO } from './dates'
import type { SettlementResult } from './settlement'

/**
 * The settlement as a CSV file that opens correctly in a German Excel:
 * semicolons between fields, a decimal comma, and a byte-order mark so the
 * umlauts survive.
 */

const decimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})
const kmFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, useGrouping: false })

/** Tells Excel the file is UTF-8, so the umlauts survive. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)

const euros = (cents: number) => decimal.format(cents / 100)
const km = (value: number) => kmFormat.format(value)

/** Amounts such as "-12,50" or "40 %" must stay numbers in Excel. */
const NUMBER_LIKE = /^-?\d+(,\d+)?( %)?$/

/**
 * Quote a field when it contains a separator, a quote or a line break.
 * Text that Excel would run as a formula (a note starting with "=", "+", "-"
 * or "@") gets a leading apostrophe, so it is shown as plain text.
 */
export function csvCell(value: string | number): string {
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text) && !NUMBER_LIKE.test(text)) text = `'${text}`
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const line = (cells: (string | number)[]) => cells.map(csvCell).join(';')

export function buildSettlementCsv({
  result,
  trips,
  payments,
  profiles,
  cars,
  periodLabel,
}: {
  result: SettlementResult
  trips: Trip[]
  payments: SettlementPayment[]
  profiles: Profile[]
  cars: Car[]
  periodLabel: string
}): string {
  const name = (id: UUID) => profiles.find((p) => p.id === id)?.displayName ?? 'Unbekannt'
  const carName = (id: UUID | null) =>
    id ? (cars.find((c) => c.id === id)?.name ?? 'Auto') : 'Kein bestimmtes Auto'

  const out: string[] = [
    line(['Abrechnung', periodLabel]),
    line(['Verteilung', SPLIT_RULE_LABELS[result.rule]]),
    line(['Kosten gesamt (EUR)', euros(result.totalCents)]),
    line(['Kilometer gesamt', km(result.totalKm)]),
    '',
    line(['Personen']),
    line([
      'Person',
      'km',
      'Anteil km',
      'Anteil (EUR)',
      'Bezahlt (EUR)',
      'Ausgleich gezahlt (EUR)',
      'Saldo (EUR)',
    ]),
    ...result.people.map((p) =>
      line([
        p.displayName,
        km(p.distanceKm),
        `${Math.round(p.kmShare * 100)} %`,
        euros(p.owesCents),
        euros(p.paidCents),
        euros(p.settledCents),
        euros(p.balanceCents),
      ]),
    ),
    '',
    line(['Posten']),
    line([
      'Datum',
      'Art',
      'Auto',
      'Bezahlt von',
      'Betrag im Zeitraum (EUR)',
      'Verteilt',
      ...result.people.map((p) => `Anteil ${p.displayName} (EUR)`),
    ]),
    ...result.lines.map((l) =>
      line([
        formatDateISO(l.expense.incurredOn),
        CATEGORY_LABELS[l.expense.category],
        carName(l.expense.carId),
        name(l.expense.userId),
        euros(l.accruedCents),
        l.basis === 'km' ? 'nach km' : 'gleich',
        ...result.people.map((p) => euros(l.sharesByUser.get(p.userId) ?? 0)),
      ]),
    ),
    '',
    line(['Fahrten']),
    line(['Datum', 'Auto', 'km-Stand Start', 'km-Stand Ende', 'km', 'Personen', 'Notiz']),
    ...trips.map((t) =>
      line([
        formatDateISO(t.drivenOn),
        carName(t.carId),
        t.odometerStart,
        t.odometerEnd,
        t.distanceKm,
        t.participantIds.map(name).join(', '),
        t.note ?? '',
      ]),
    ),
    '',
    line(['Ausgleichszahlungen']),
    line(['Gilt für', 'Von', 'An', 'Betrag (EUR)']),
    ...payments.map((p) =>
      line([
        formatDateISO(p.appliesOn),
        name(p.fromUserId),
        name(p.toUserId),
        euros(p.amountCents),
      ]),
    ),
  ]

  return BYTE_ORDER_MARK + out.join('\r\n') + '\r\n'
}

/** Hand the text to the browser as a file download. */
export function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
