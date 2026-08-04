// ─── Dialog portraits ─────────────────────────────────────────────────────────
// The portrait browser's data model. Dialog avatars are not only heroes: of the 123
// distinct avatar `icon` references in the shipped dialogs, most are unit portraits,
// a handful are unique NPCs, and many are dialogue-specific hero art that lives beside
// the hero's own `<icon>_large` portrait.
//
// Everything here is derived from Core.zip rather than hardcoded, so the browser shows
// what the game actually ships. Factions come from the records themselves — a peasant is
// `fraction: "neutral"` in the unit DB, which is why it lands under Neutral without any
// special case.

import type { GameCatalog, CatalogHero } from '@/lib/catalog/types'
import { assetLeafName, heroAvatarIcon, LARGE_PORTRAIT_SUFFIX } from '@/lib/catalog/icon-requests'

export type PortraitKind = 'hero' | 'unit' | 'unique'

/** Filter keys shown in the browser's Kind group, in display order. */
export const PORTRAIT_KINDS: PortraitKind[] = ['hero', 'unit', 'unique']

export const PORTRAIT_KIND_LABELS: Record<PortraitKind, string> = {
  hero: 'Heroes',
  unit: 'Units',
  unique: 'Unique',
}

export interface PortraitEntry {
  /** Stable React key. Icon paths are unique across entries, but heroes sharing one
   *  portrait would collide, so the hero SID disambiguates the primary tiles. */
  key: string
  /** Value written to `avatar.icon` when picked in portrait mode. */
  icon: string
  name: string
  /** Hero SID, or the icon leaf for everything else. */
  sublabel: string
  kind: PortraitKind
  /** Internal faction id ("human", "neutral", …). Empty means unknown → Neutral. */
  fraction: string
  /** Set for every `kind === 'hero'` entry; what hero mode writes back. */
  heroId?: string
  /**
   * The hero's raw `icon`, so hero mode can keep resolving thumbnails through
   * `heroPortraitPath` — which falls back to the plain card icon when the large portrait
   * has not been extracted, or does not exist (hero_campaign_10_dragonfly_king).
   */
  heroIcon?: string
  /** Marks dialogue-specific art so it is not mistaken for the hero's own portrait. */
  variant?: 'alt' | 'shadow' | 'mirror'
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

/** Suffixes the game appends to mark an art variant of the same subject. */
const VARIANT_SUFFIXES: Array<{ suffix: string; variant: 'shadow' | 'mirror' }> = [
  { suffix: '_shadow', variant: 'shadow' },
  { suffix: '_mirror', variant: 'mirror' },
]

/** Prefixes that mark a reference as pointing at a unit rather than a hero. */
const UNIT_PREFIXES = ['dialogue_unit_', 'dialog_unit_', 'icon_', 'dialogue_', 'dialog_']

/** "dialogue_unique_burning_heart_man" → "Burning Heart Man" */
function prettify(leaf: string): string {
  const stripped = leaf
    .replace(/^(dialogue|dialog)_(unique|unit|hero)_/i, '')
    .replace(/^(dialogue|dialog)_/i, '')
    .replace(/^icon_/i, '')
    .replace(new RegExp(`${LARGE_PORTRAIT_SUFFIX}$`, 'i'), '')
  return stripped
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Readable name for a hero whose localized name is missing.
 *
 * Three campaign records (lafiur, lyssara ×2) resolve to "???" because their name token is
 * not in customMaps.json. The icon still carries the name, after the numeric index:
 * `hero_campaign_2_lafiur` → "Lafiur". Better than showing "???" beside a portrait.
 */
function heroNameFromIcon(icon: string): string {
  const parts = icon.split('_')
  const lastNumeric = parts.reduce((idx, p, i) => (/^\d+$/.test(p) ? i : idx), -1)
  const tail = lastNumeric >= 0 ? parts.slice(lastNumeric + 1) : parts
  return tail
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** The catalog uses "???" for names it could not resolve. */
function usableName(name: string | undefined): boolean {
  return !!name && name.trim() !== '' && name !== '???'
}

function heroDisplayName(hero: CatalogHero): string {
  return usableName(hero.name) ? hero.name : heroNameFromIcon(hero.icon) || hero.id
}

function splitVariant(leaf: string): { base: string; variant?: 'shadow' | 'mirror' } {
  const lower = leaf.toLowerCase()
  for (const { suffix, variant } of VARIANT_SUFFIXES) {
    if (lower.endsWith(suffix)) return { base: leaf.slice(0, -suffix.length), variant }
  }
  return { base: leaf }
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

interface Lookups {
  /** hero.icon (lowercased) → hero */
  heroByIcon: Map<string, CatalogHero>
  /** trailing name slug of hero.icon (lowercased) → hero */
  heroByNameSlug: Map<string, CatalogHero>
  /** creature id (lowercased) → { name, fraction } */
  creatures: Map<string, { name: string; fraction: string }>
}

function buildLookups(catalog: GameCatalog): Lookups {
  const heroByIcon = new Map<string, CatalogHero>()
  const heroByNameSlug = new Map<string, CatalogHero>()

  for (const hero of catalog.heroes) {
    if (!hero.icon) continue
    const icon = hero.icon.toLowerCase()
    // First record wins. 115 icons are shared by 177 records, and one
    // (hero_necromancer_4_kelghul) even disagrees on faction between its campaign and
    // standard entries — so pick deterministically rather than imply it is unambiguous.
    if (!heroByIcon.has(icon)) heroByIcon.set(icon, hero)

    // Dialogue art is named after the hero, not the icon: `dialogue_hero_Thant` against
    // icon `hero_campaign_1_thant`. Index every trailing slug of the icon so the longest
    // match can be found without guessing where the name starts.
    const parts = icon.split('_')
    for (let i = 1; i < parts.length; i++) {
      const slug = parts.slice(i).join('_')
      if (!heroByNameSlug.has(slug)) heroByNameSlug.set(slug, hero)
    }
  }

  const creatures = new Map<string, { name: string; fraction: string }>()
  for (const c of catalog.creatures) {
    if (!c.id) continue
    const key = c.id.toLowerCase()
    if (!creatures.has(key)) creatures.set(key, { name: c.name, fraction: c.fraction })
  }

  return { heroByIcon, heroByNameSlug, creatures }
}

// ─── Classification ───────────────────────────────────────────────────────────

interface Resolved {
  kind: PortraitKind
  name: string
  sublabel: string
  fraction: string
  heroId?: string
  heroIcon?: string
}

function resolveHero(base: string, l: Lookups): CatalogHero | undefined {
  const lower = base.toLowerCase()

  // Exact hero icon, with or without the _large suffix, optionally behind a
  // dialog_/dialogue_ prefix ("dialog_hero_human_7_leandra_large").
  const candidates = [lower]
  const noPrefix = lower.replace(/^(dialogue|dialog)_/, '')
  if (noPrefix !== lower) candidates.push(noPrefix)
  for (const c of [...candidates]) {
    if (c.endsWith(LARGE_PORTRAIT_SUFFIX)) candidates.push(c.slice(0, -LARGE_PORTRAIT_SUFFIX.length))
  }
  for (const c of candidates) {
    const hit = l.heroByIcon.get(c)
    if (hit) return hit
  }

  // Name-based dialogue art: "dialogue_hero_Old_Lord_Mandall" → slug old_lord_mandall.
  const m = /^(?:dialogue|dialog)_hero_(.+)$/.exec(lower)
  if (m) {
    const slug = m[1].replace(new RegExp(`${LARGE_PORTRAIT_SUFFIX}$`), '')
    return l.heroByNameSlug.get(slug)
  }
  return undefined
}

function resolveUnit(base: string, l: Lookups): { name: string; fraction: string } | undefined {
  const lower = base.toLowerCase()
  const tries = [lower]
  for (const p of UNIT_PREFIXES) {
    if (lower.startsWith(p)) tries.push(lower.slice(p.length))
  }
  for (const t of tries) {
    const hit = l.creatures.get(t)
    if (hit) return hit
  }
  return undefined
}

function classify(ref: string, l: Lookups): Resolved {
  const leaf = assetLeafName(ref)
  const { base } = splitVariant(leaf)

  const hero = resolveHero(base, l)
  if (hero) {
    return {
      kind: 'hero',
      name: heroDisplayName(hero),
      sublabel: hero.id,
      fraction: hero.fraction,
      heroId: hero.id,
      heroIcon: hero.icon,
    }
  }

  const unit = resolveUnit(base, l)
  if (unit) {
    return {
      kind: 'unit',
      name: usableName(unit.name) ? unit.name : prettify(leaf),
      sublabel: leaf,
      fraction: unit.fraction,
    }
  }

  // Unique NPCs are explicitly named as such. Everything else that resolves to nothing
  // is left with an empty faction, which groups under Neutral — honest about not knowing
  // rather than inventing a faction. Five of the 123 shipped refs land here.
  const isUnique = /^(dialogue|dialog)_unique_/i.test(leaf)
  return {
    kind: isUnique ? 'unique' : /hero/i.test(leaf) ? 'hero' : 'unit',
    name: prettify(leaf),
    sublabel: leaf,
    fraction: '',
  }
}

// ─── Entry list ───────────────────────────────────────────────────────────────

/**
 * Every portrait the browser can offer.
 *
 * Two sources: one primary tile per hero (the `<icon>_large` portrait, which is what
 * `heroAvatarIcon()` writes), plus every avatar reference the shipped dialogs use. A
 * reference identical to a hero's primary value is dropped so the same portrait is not
 * listed twice; the remaining hero references become `variant` tiles under that hero's
 * faction.
 */
export function buildPortraitEntries(catalog: GameCatalog | null): PortraitEntry[] {
  if (!catalog) return []
  const l = buildLookups(catalog)

  const entries: PortraitEntry[] = []
  const primaryIcons = new Set<string>()

  for (const hero of catalog.heroes) {
    if (!hero.icon) continue
    const icon = heroAvatarIcon(hero.icon)
    primaryIcons.add(icon)
    entries.push({
      key: `hero:${hero.id}`,
      icon,
      name: heroDisplayName(hero),
      sublabel: hero.id,
      kind: 'hero',
      fraction: hero.fraction,
      heroId: hero.id,
      heroIcon: hero.icon,
    })
  }

  const seen = new Set<string>()
  for (const ref of catalog.dialogAvatarIcons ?? []) {
    const leaf = assetLeafName(ref).trim()
    // Same malformed entries avatarIconRequests() drops: bare numbers from `avatars.icons`.
    if (!leaf || /^\d+$/.test(leaf)) continue
    if (primaryIcons.has(ref) || seen.has(ref)) continue
    seen.add(ref)

    const { variant } = splitVariant(leaf)
    const r = classify(ref, l)
    entries.push({
      key: `ref:${ref}`,
      icon: ref,
      name: r.name,
      sublabel: r.sublabel,
      kind: r.kind,
      fraction: r.fraction,
      heroId: r.heroId,
      heroIcon: r.heroIcon,
      // Hero references that are not the hero's own primary portrait are alternate art.
      variant: variant ?? (r.kind === 'hero' ? 'alt' : undefined),
    })
  }

  return entries
}
