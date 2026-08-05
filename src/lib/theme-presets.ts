import type { ThemeColors, ThemeSettings } from '@/store/useThemeSettingsStore'

// Matches DEFAULT_FONT_SIZE in useThemeSettingsStore.ts — duplicated (rather
// than imported) to avoid a runtime circular import, since that module
// imports PRESET_THEMES from here.
const PRESET_FONT_SIZE = 14

// ─── Color math ─────────────────────────────────────────────────────────────
// Numeric HSL helpers, distinct from hexToHsl() in useApplyThemeSettings.ts
// (which returns a CSS "H S% L%" string for shadcn variables, not numbers).

function hexToHsl01(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace(/^#/, '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h: number
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    default: h = ((r - g) / d + 4) / 6
  }

  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  const toChannel = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
  }
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(toChannel(0))}${toHex(toChannel(8))}${toHex(toChannel(4))}`
}

/** Blends a color toward white by `ratio` (0 = unchanged, 1 = pure white). */
function mixWithWhite(hex: string, ratio: number): string {
  const { h, s, l } = hexToHsl01(hex)
  return hslToHex(h, s, l + (1 - l) * ratio)
}

// ─── Palette → ThemeColors derivation ──────────────────────────────────────
//
// Only 4 source colors exist per palette but ThemeColors has 8 fields, so the
// other 4 are computed rather than hand-picked. Priority (per product
// requirement): the app background must be the darkest of the 4 palette
// colors, and the 3 remaining colors become the column backgrounds, graduated
// light-to-dark left-to-right to match the shipped Default Light theme.
export function deriveThemeColors(hexes: readonly [string, string, string, string]): ThemeColors {
  // Ascending by lightness: darkest -> appBackground, then the remaining 3
  // graduate lightest-to-darkest across columnLeft -> columnCenter -> columnRight,
  // matching the shipped Default Light theme.
  const sorted = [...hexes].sort((a, b) => hexToHsl01(a).l - hexToHsl01(b).l)
  const [appBackground, columnRight, columnCenter, columnLeft] = sorted

  // appBackground + the 3 columns already consume all 4 source colors, so
  // reusing one of them as-is for `primary` would always exactly duplicate a
  // surface it sits next to. Instead take the hue of the palette's most
  // saturated color and push it to a punchier, button-appropriate lightness —
  // a computed accent rather than a fourth reused raw value.
  const mostSaturatedHex = [...hexes].sort((a, b) => hexToHsl01(b).s - hexToHsl01(a).s)[0]
  const { h: primaryHue, s: primarySaturation } = hexToHsl01(mostSaturatedHex)
  const primary = hslToHex(primaryHue, Math.min(Math.max(primarySaturation, 0.55), 0.95), 0.4)

  return {
    appBackground,
    background: mixWithWhite(columnLeft, 0.5),
    columnLeft,
    columnCenter,
    columnRight,
    popover: '#ffffff',
    primary,
    secondary: mixWithWhite(appBackground, 0.8),
  }
}

// ─── Source palettes ────────────────────────────────────────────────────────
// Curated from colorhunt.co/palettes/{popular,pastel,vintage,nature,light},
// 3 per category. Hex order as listed on Color Hunt (not pre-sorted).

export type PresetCategory = 'Popular' | 'Pastel' | 'Vintage' | 'Nature' | 'Light'

interface PaletteSource {
  id: string
  name: string
  category: PresetCategory
  hexes: readonly [string, string, string, string]
}

const PALETTE_SOURCES: PaletteSource[] = [
  // Popular
  { id: 'coral-reef', name: 'Coral Reef', category: 'Popular', hexes: ['#67A2C5', '#9BCEC1', '#FFEBD3', '#FFB6A6'] },
  { id: 'autumn-harbor', name: 'Autumn Harbor', category: 'Popular', hexes: ['#457B9D', '#F4D35E', '#E63946', '#8B1E2D'] },
  { id: 'cerulean-pop', name: 'Cerulean Pop', category: 'Popular', hexes: ['#97DDE9', '#5FACD3', '#525EA7', '#FFC349'] },
  // Pastel
  { id: 'lavender-mist', name: 'Lavender Mist', category: 'Pastel', hexes: ['#D9F9DF', '#AEE2FF', '#B5BAFF', '#9FA1FF'] },
  { id: 'dusty-plum', name: 'Dusty Plum', category: 'Pastel', hexes: ['#FFDAB3', '#C8AAAA', '#9F8383', '#574964'] },
  { id: 'blush-garden', name: 'Blush Garden', category: 'Pastel', hexes: ['#F6FFDC', '#DAF9DE', '#CFECF3', '#F9B2D7'] },
  // Vintage
  { id: 'aged-parchment', name: 'Aged Parchment', category: 'Vintage', hexes: ['#4E220F', '#9D6638', '#B0BA99', '#F7F1DE'] },
  { id: 'antique-study', name: 'Antique Study', category: 'Vintage', hexes: ['#7B2525', '#BA6A4C', '#EEE0CC', '#607456'] },
  { id: 'old-photograph', name: 'Old Photograph', category: 'Vintage', hexes: ['#202940', '#4B4038', '#9A8678', '#CAAA98'] },
  // Nature
  { id: 'forest-canopy', name: 'Forest Canopy', category: 'Nature', hexes: ['#273338', '#2B5748', '#618764', '#9CB080'] },
  { id: 'olive-grove', name: 'Olive Grove', category: 'Nature', hexes: ['#40513B', '#628141', '#E5D9B6', '#E67E22'] },
  { id: 'meadow-dew', name: 'Meadow Dew', category: 'Nature', hexes: ['#36656B', '#75B06F', '#DAD887', '#F0F8A4'] },
  // Light
  { id: 'powder-blue', name: 'Powder Blue', category: 'Light', hexes: ['#F9E8A2', '#B4E1EB', '#95BDD7', '#78A4CB'] },
  { id: 'rosewater', name: 'Rosewater', category: 'Light', hexes: ['#FBEFEF', '#FFE2E2', '#F5CBCB', '#C5B3D3'] },
  { id: 'cottage-blush', name: 'Cottage Blush', category: 'Light', hexes: ['#C0E1D2', '#E5EEE4', '#F6F4E8', '#DC9B9B'] },
]

export const PRESET_CATEGORY_ORDER: PresetCategory[] = ['Popular', 'Pastel', 'Vintage', 'Nature', 'Light']

export const PRESET_THEMES: ThemeSettings[] = PALETTE_SOURCES.map((source) => ({
  id: `preset-${source.id}`,
  name: source.name,
  category: source.category,
  colors: deriveThemeColors(source.hexes),
  fontSize: PRESET_FONT_SIZE,
  use3dButtons: true,
}))
