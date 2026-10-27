import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverPdf, isIos, pageSlices } from './pdfExport'

describe('pageSlices', () => {
  it('keeps a short page in one piece', () => {
    expect(pageSlices(500, 1000, [100, 300])).toEqual([[0, 500]])
  })

  it('ends a page at the last break that fits', () => {
    expect(pageSlices(2500, 1000, [400, 900, 1100, 1800])).toEqual([
      [0, 900],
      [900, 1800],
      [1800, 2500],
    ])
  })

  it('cuts where the page is full when no break fits', () => {
    expect(pageSlices(2500, 1000, [])).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 2500],
    ])
  })

  it('ignores a break that would leave the page mostly empty', () => {
    expect(pageSlices(1500, 1000, [100])).toEqual([
      [0, 1000],
      [1000, 1500],
    ])
  })
})

describe('isIos', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stub(userAgent: string, maxTouchPoints: number) {
    vi.stubGlobal('navigator', { ...navigator, userAgent, maxTouchPoints })
  }

  it('recognises an iPhone', () => {
    stub('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', 5)
    expect(isIos()).toBe(true)
  })

  it('recognises an iPad that reports itself as a Mac', () => {
    stub('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)
    expect(isIos()).toBe(true)
  })

  it('leaves a real Mac and Windows alone', () => {
    stub('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)
    expect(isIos()).toBe(false)
    stub('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 0)
    expect(isIos()).toBe(false)
  })
})

describe('deliverPdf', () => {
  afterEach(() => vi.unstubAllGlobals())
  const file = new File(['%PDF'], 'abrechnung-2026-10.pdf', {
    type: 'application/pdf',
  })

  it('hands the file alone to the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })
    expect(await deliverPdf(file)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file] })
  })

  it('asks for another tap when iOS refuses without one', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('no gesture', 'NotAllowedError'))
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })
    expect(await deliverPdf(file)).toBe('needs-tap')
  })

  it('treats closing the share sheet as cancelled, not as an error', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'))
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })
    expect(await deliverPdf(file)).toBe('cancelled')
  })
})
