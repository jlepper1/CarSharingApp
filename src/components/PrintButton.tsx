import { useState } from 'react'
import { createPortal } from 'react-dom'
import { deliverPdf, isIos, renderPdf } from '../lib/pdfExport'
import { Sheet } from './Sheet'
import { Button, Spinner } from './ui'

/**
 * "Drucken / PDF" for the page it sits on. Elsewhere the browser's print
 * dialog does both; on iOS the page becomes a PDF for the share sheet (see
 * pdfExport.ts).
 */
export default function PrintButton({
  filename,
  className = '',
}: {
  /** Name of the PDF on iOS, e.g. "abrechnung-2026-10.pdf". */
  filename: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  // Built, but iOS wants another tap before it opens the share sheet.
  const [ready, setReady] = useState<File | null>(null)

  async function share(file: File) {
    try {
      const delivery = await deliverPdf(file)
      setReady(delivery === 'needs-tap' ? file : null)
    } catch (error) {
      setReady(null)
      alert(`Das PDF konnte nicht geteilt werden. ${(error as Error).message}`)
    }
  }

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!isIos()) {
      window.print()
      return
    }
    const root = event.currentTarget.closest<HTMLElement>('[data-print-root]')
    if (!root || busy) return
    setBusy(true)
    let file: File
    try {
      const blob = await renderPdf(root)
      file = new File([blob], filename, { type: 'application/pdf' })
    } catch (error) {
      alert(`Das PDF konnte nicht erstellt werden. ${(error as Error).message}`)
      return
    } finally {
      setBusy(false)
    }
    await share(file)
  }

  return (
    <>
      <Button
        variant="ghost"
        className={`px-2 ${className}`}
        onClick={(event) => void handleClick(event)}
        disabled={busy}
      >
        Drucken / PDF
      </Button>
      {/* Outside the page, or it would end up in the PDF. */}
      {busy
        ? createPortal(
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40">
              <div className="rounded-xl bg-white px-6">
                <Spinner label="PDF wird erstellt …" />
              </div>
            </div>,
            document.body,
          )
        : null}
      {ready
        ? createPortal(
            <Sheet title="PDF ist fertig" dirty={false} onClose={() => setReady(null)}>
              <p className="mb-4 text-sm text-slate-600">
                Über „Teilen“ lässt sich das PDF drucken, in „Dateien“ sichern oder verschicken.
              </p>
              <Button className="w-full" onClick={() => void share(ready)}>
                Teilen / Drucken
              </Button>
            </Sheet>,
            document.body,
          )
        : null}
    </>
  )
}
