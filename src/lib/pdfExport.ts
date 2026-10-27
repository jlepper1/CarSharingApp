/**
 * "Drucken / PDF" on iPhone and iPad.
 *
 * window.print() does nothing in an app added to the home screen, and in
 * Safari it only prints. So on iOS the page is turned into a PDF here and
 * handed to the share sheet, which offers "Drucken" and "In Dateien sichern".
 */

/** Class on <html> that switches on the print: styles while the page is captured. */
const EXPORT_CLASS = 'pdf-export'

/** A4 portrait with a 12 mm margin, in mm. */
const PAGE = { width: 210, height: 297, margin: 12 }

/** iOS refuses canvases above about 16.7 million pixels; stay well below. */
const MAX_PIXELS = 14_000_000

export function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; only the touch screen gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/**
 * Where each page ends, in pixels from the top of the capture. A page ends at
 * the last break that fits, so cards and rows are not cut in half; only an
 * element taller than a whole page is cut where the page is full.
 */
export function pageSlices(total: number, page: number, breaks: number[]): [number, number][] {
  const sorted = [...new Set(breaks.map(Math.round))].sort((a, b) => a - b)
  const slices: [number, number][] = []
  let start = 0
  while (total - start > page) {
    const limit = start + page
    let end = limit
    // A break in the top third would leave the page mostly empty.
    for (const b of sorted) if (b > start + page / 3 && b <= limit) end = b
    slices.push([start, end])
    start = end
  }
  slices.push([start, total])
  return slices
}

/**
 * Tops of the blocks a page may end before, in CSS px from the root's top.
 * Like the print dialog, a page never ends inside a card that fits on a page.
 */
function breakPositions(root: HTMLElement, pageHeight: number): number[] {
  const top = root.getBoundingClientRect().top
  const keepTogether = [...root.querySelectorAll('[class*="print:break-inside-avoid"]')]
    .map((el) => el.getBoundingClientRect())
    .filter((box) => box.height < pageHeight)
    .map((box) => [box.top - top, box.bottom - top])

  const positions: number[] = []
  for (const el of root.querySelectorAll<HTMLElement>(':scope > *, li, tr')) {
    // Keep a heading together with what follows it.
    const previous = el.previousElementSibling
    const anchor = previous?.tagName === 'H2' ? previous : el
    const y = anchor.getBoundingClientRect().top - top
    if (!keepTogether.some(([from, to]) => y > from + 1 && y < to - 1)) positions.push(y)
  }
  return positions
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** The element as it would be printed, laid out on A4 pages. */
export async function renderPdf(root: HTMLElement): Promise<Blob> {
  const [{ domToCanvas }, { jsPDF }] = await Promise.all([
    import('modern-screenshot'),
    import('jspdf'),
  ])

  const html = document.documentElement
  html.classList.add(EXPORT_CLASS)
  let canvas: HTMLCanvasElement
  let breaks: number[]
  try {
    await nextFrame()
    const { width, height } = root.getBoundingClientRect()
    const scale = Math.min(3, Math.sqrt(MAX_PIXELS / (width * height)))
    const pageHeight = (width * (PAGE.height - 2 * PAGE.margin)) / (PAGE.width - 2 * PAGE.margin)
    breaks = breakPositions(root, pageHeight).map((y) => y * scale)
    canvas = await domToCanvas(root, { scale, backgroundColor: '#ffffff' })
  } finally {
    html.classList.remove(EXPORT_CLASS)
  }

  const contentWidth = PAGE.width - 2 * PAGE.margin
  const pxPerMm = canvas.width / contentWidth
  const pageHeightPx = (PAGE.height - 2 * PAGE.margin) * pxPerMm

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const slice = document.createElement('canvas')
  slice.width = canvas.width
  const context = slice.getContext('2d')
  if (!context) throw new Error('Canvas wird nicht unterstützt.')

  pageSlices(canvas.height, pageHeightPx, breaks).forEach(([start, end], index) => {
    const height = Math.ceil(end - start)
    slice.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, slice.width, height)
    context.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height)
    if (index > 0) pdf.addPage()
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      PAGE.margin,
      PAGE.margin,
      contentWidth,
      height / pxPerMm,
    )
  })

  return pdf.output('blob')
}

/**
 * - shared: the share sheet was used
 * - cancelled: it was opened and closed again
 * - needs-tap: iOS only opens it straight after a tap, and building the PDF
 *   took too long, so another tap is needed
 * - downloaded: no share sheet for files, the PDF was saved instead
 */
export type Delivery = 'shared' | 'cancelled' | 'needs-tap' | 'downloaded'

export async function deliverPdf(file: File): Promise<Delivery> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      // Files only: with a title or text, "In Dateien sichern" stores a
      // second, plain text file next to the PDF.
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      if (error instanceof DOMException && error.name === 'NotAllowedError') return 'needs-tap'
      throw error
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Safari still reads the file after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
