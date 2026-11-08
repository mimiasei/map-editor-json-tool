// ─── Map Grid — image-to-map colour mapping (pure logic behind ImageColorMappingDialog) ───
// The dialog scales the image to the map size first, reduces it to a handful of colours, and lets the user give each colour a terrain,
// water type or object. A colour key is the quantized "r,g,b,a" string. Everything here works on keys, so it runs without a canvas.

import { BIOME_BASE_COLORS, WATER_BASE_COLORS, WATER_TYPE_NAMES, type BiomeId } from './terrain-colors'

export type ImageColorTarget =
  | { kind: 'terrain'; biomeId: BiomeId }
  | { kind: 'water'; waterId: number }
  | { kind: 'object'; sid: string }

export type ColorMapping = Record<string, ImageColorTarget>
export type ColorLimit = 8 | 16 | 32

export interface ColorEntry {
  key: string
  css: string
  count: number
}

export const COLOR_LIMITS: ColorLimit[] = [8, 16, 32]
export const BIOMES: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

export function colorKey(r: number, g: number, b: number, a: number): string {
  return `${r},${g},${b},${a}`
}

export function parseKey(key: string): [number, number, number, number] {
  const [r, g, b, a] = key.split(',').map(Number)
  return [r, g, b, a]
}

export function colorCss(key: string): string {
  const [r, g, b, a] = parseKey(key)
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

/** Pixels the quantizer made fully transparent: never listed, never painted. */
export function isTransparentKey(key: string): boolean {
  return key.endsWith(',0')
}

export function colorDistance(left: string, right: string): number {
  const a = parseKey(left)
  const b = parseKey(right)
  const redMean = (a[0] + b[0]) / 2
  const red = a[0] - b[0]
  const green = a[1] - b[1]
  const blue = a[2] - b[2]
  // A lightweight perceptual RGB distance: red/blue weights vary with hue.
  return (2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue
}

function quantizeChannel(value: number, levels: number): number {
  if (levels <= 1) return 0
  return Math.round((Math.round(value / 255 * (levels - 1)) / (levels - 1)) * 255)
}

/** Deterministic RGB reduction with a strict maximum of 8, 16, or 32 bins. Alpha becomes all-or-nothing (a half-transparent edge pixel is not a colour of its own). */
export function quantizeRgba(data: Uint8ClampedArray, colorLimit: ColorLimit): Uint8ClampedArray {
  const channelLevels = colorLimit === 8 ? [2, 2, 2] : colorLimit === 16 ? [2, 2, 4] : [2, 4, 4]
  const output = new Uint8ClampedArray(data)
  for (let i = 0; i < output.length; i += 4) {
    if (output[i + 3] < 128) {
      output[i] = output[i + 1] = output[i + 2] = output[i + 3] = 0
      continue
    }
    output[i] = quantizeChannel(output[i], channelLevels[0])
    output[i + 1] = quantizeChannel(output[i + 1], channelLevels[1])
    output[i + 2] = quantizeChannel(output[i + 2], channelLevels[2])
    output[i + 3] = 255
  }
  return output
}

/** One key per pixel (row by row) and the listed colours, most used first. */
export function buildPalette(data: Uint8ClampedArray): { pixels: string[]; entries: ColorEntry[] } {
  const counts = new Map<string, number>()
  const pixels: string[] = []
  for (let i = 0; i < data.length; i += 4) {
    const key = colorKey(data[i], data[i + 1], data[i + 2], data[i + 3])
    pixels.push(key)
    if (!isTransparentKey(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, css: colorCss(key), count }))
  return { pixels, entries }
}

function nearestKey(key: string, candidates: string[]): string | undefined {
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = colorDistance(key, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/** A new palette (another colour limit): each colour takes the choice of the nearest old colour, "ignore" included. */
export function reseatMapping(oldKeys: string[], oldMapping: ColorMapping, newKeys: string[]): ColorMapping {
  const next: ColorMapping = {}
  for (const key of newKeys) {
    const old = nearestKey(key, oldKeys)
    const target = old === undefined ? undefined : oldMapping[old]
    if (target) next[key] = target
  }
  return next
}

function hexKey(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return colorKey((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255)
}

/** Fills the colours still set to ignore with the nearest biome or water colour of the Map Grid. Objects are never guessed. */
export function suggestMapping(entryKeys: string[], mapping: ColorMapping): ColorMapping {
  const candidates = new Map<string, ImageColorTarget>()
  for (const biome of BIOMES) candidates.set(hexKey(BIOME_BASE_COLORS[biome]), { kind: 'terrain', biomeId: biome })
  for (const id of Object.keys(WATER_TYPE_NAMES).map(Number)) {
    if (WATER_BASE_COLORS[id]) candidates.set(hexKey(WATER_BASE_COLORS[id]), { kind: 'water', waterId: id })
  }
  const keys = [...candidates.keys()]
  const next = { ...mapping }
  for (const key of entryKeys) {
    if (next[key]) continue
    const nearest = nearestKey(key, keys)
    if (nearest) next[key] = candidates.get(nearest) as ImageColorTarget
  }
  return next
}

/** The mapping the painter gets. Colours set to ignore stay unmapped (their tiles are left alone) unless `fillIgnored` borrows the nearest mapped colour. */
export function resolveFill(entryKeys: string[], mapping: ColorMapping, fillIgnored: boolean): ColorMapping {
  const mappedKeys = Object.keys(mapping)
  if (!fillIgnored || mappedKeys.length === 0) return { ...mapping }
  const resolved = { ...mapping }
  for (const key of entryKeys) {
    if (resolved[key]) continue
    const nearest = nearestKey(key, mappedKeys)
    if (nearest) resolved[key] = mapping[nearest]
  }
  return resolved
}

export interface SerializedImageMapping {
  version: 1
  name: string
  /** Absent in files saved before the limit was recorded; the colour keys only match at the limit they were made with. */
  colorLimit?: ColorLimit
  mappings: ColorMapping
}

/** Valid entries of a saved mapping file, or null when it is not one. */
export function parseMappingFile(text: string): { mappings: ColorMapping; colorLimit?: ColorLimit } | null {
  let parsed: Partial<SerializedImageMapping>
  try {
    parsed = JSON.parse(text) as Partial<SerializedImageMapping>
  } catch {
    return null
  }
  if (!parsed || parsed.version !== 1 || !parsed.mappings || typeof parsed.mappings !== 'object') return null
  const mappings: ColorMapping = {}
  for (const [key, target] of Object.entries(parsed.mappings)) {
    if (!/^\d+,\d+,\d+,\d+$/.test(key) || !target || typeof target !== 'object') continue
    if (target.kind === 'terrain' && BIOMES.includes(target.biomeId)) mappings[key] = target
    else if (target.kind === 'water' && Object.prototype.hasOwnProperty.call(WATER_TYPE_NAMES, target.waterId)) mappings[key] = target
    else if (target.kind === 'object' && typeof target.sid === 'string' && target.sid.trim()) mappings[key] = target
  }
  const colorLimit = COLOR_LIMITS.find((limit) => limit === parsed.colorLimit)
  return { mappings, colorLimit }
}
