// ─── Start screen background ─────────────────────────────────────────────────
// The cells are drawn in the theme's background colour. The third column's colour is the first choice for the screen behind them, but a
// theme can make it too close to the cells for them to read, so then the most contrasting of the other theme colours is used instead.

import { useEffect, useState } from 'react'

/** Smallest WCAG contrast ratio between the cells and the screen behind them for the column colour to be used. Chosen by eye: the
 *  default light theme (#f6f7f9 background on #a1c3dc) is about 1.7. */
export const MIN_CELL_CONTRAST = 1.5

/** Resolves any CSS colour (hex, hsl(var(--x)), ...) to [r, g, b] by letting the browser compute it. */
function resolveRgb(css: string): [number, number, number] | null {
  const probe = document.createElement('div')
  probe.style.backgroundColor = css
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).backgroundColor
  probe.remove()
  const m = computed.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return null
  return [Number(m[0]), Number(m[1]), Number(m[2])]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The CSS colour for the start screen's background under the current theme. */
export function startScreenBackground(): string {
  // In dark mode the columns are drawn in the card colour (AppShell: dark:bg-card), so that is the "third column colour" there.
  const dark = document.documentElement.classList.contains('dark')
  const column = dark ? 'hsl(var(--card))' : 'var(--column-right)'
  const cell = resolveRgb('hsl(var(--background))')
  const columnRgb = resolveRgb(column)
  if (!cell || !columnRgb) return column
  if (contrastRatio(cell, columnRgb) >= MIN_CELL_CONTRAST) return column
  // The cells are the theme background, so it cannot also be the fallback: take the theme colour that stands out most from it.
  const fallbacks = dark ? [] : ['var(--column-center)', 'var(--column-left)', 'var(--app-background)']
  let best = column
  let bestRatio = contrastRatio(cell, columnRgb)
  for (const css of fallbacks) {
    const rgb = resolveRgb(css)
    if (!rgb) continue
    const ratio = contrastRatio(cell, rgb)
    if (ratio > bestRatio) { best = css; bestRatio = ratio }
  }
  return best
}

/** Follows theme changes (the theme editor sets CSS variables on <html>, dark mode is a class on it). */
export function useStartScreenBackground(): string {
  const [color, setColor] = useState(() => startScreenBackground())
  useEffect(() => {
    const update = () => setColor(startScreenBackground())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => observer.disconnect()
  }, [])
  return color
}
