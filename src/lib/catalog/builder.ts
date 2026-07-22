// ─── Game Data Catalog builder ────────────────────────────────────────────────
// Extracts all relevant game entities from a loaded Core.zip (JSZip instance).
// All names resolved in English only.

import JSZip from 'jszip'
import { readZipEntry } from './zip-loader'
import type {
  GameCatalog,
  CatalogHero,
  CatalogCreature,
  CreatureStats,
  CatalogArtifact,
  CatalogSpell,
  CatalogSkill,
  CatalogBuff,
  CatalogMapObject,
  CatalogFaction,
  CatalogDialog,
  CatalogDialogSlide,
} from './types'
import { CATALOG_SCHEMA_VERSION } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns data.array from a zip entry JSON, or [] on missing/malformed entry. */
async function readJsonArray(zip: JSZip, path: string): Promise<Record<string, unknown>[]> {
  try {
    const text = await readZipEntry(zip, path)
    const parsed = JSON.parse(text) as { array?: unknown[] }
    if (Array.isArray(parsed?.array)) return parsed.array as Record<string, unknown>[]
  } catch {
    // missing entry or parse error — caller handles gracefully
  }
  return []
}

/** Reads all JSON entries matching a glob-like prefix inside the zip. */
function zipFilesUnder(zip: JSZip, prefix: string): string[] {
  return Object.keys(zip.files).filter(
    (name) => name.startsWith(prefix) && name.endsWith('.json') && !zip.files[name].dir,
  )
}

// ─── Localization loader ──────────────────────────────────────────────────────

/**
 * Merges all `Lang/english/texts/*.json` files into a single Map<sid, text>.
 * Keys are lower-cased for case-insensitive lookup.
 * This is used by all collectors for name resolution.
 */
async function loadLocalization(zip: JSZip): Promise<Map<string, string>> {
  const loc = new Map<string, string>()
  const langFiles = zipFilesUnder(zip, 'Lang/english/texts/')
  for (const path of langFiles) {
    try {
      const text = await readZipEntry(zip, path)
      const obj = JSON.parse(text) as Record<string, unknown>
      // Format 1: { tokens: [{ sid, text }, ...] }
      if (Array.isArray(obj.tokens)) {
        for (const token of obj.tokens as Record<string, unknown>[]) {
          const sid = typeof token.sid === 'string' ? token.sid : undefined
          const val = typeof token.text === 'string' ? token.text : undefined
          if (sid && val) loc.set(sid.toLowerCase(), val)
        }
      } else {
        // Format 2: flat { key: "value", ... }
        for (const [key, val] of Object.entries(obj)) {
          if (typeof val === 'string') {
            loc.set(key.toLowerCase(), val)
          }
        }
      }
    } catch {
      // skip malformed file
    }
  }
  return loc
}

function loc(map: Map<string, string>, sid: string | undefined): string | undefined {
  if (!sid) return undefined
  return map.get(sid.toLowerCase())
}

function str(val: unknown): string {
  return typeof val === 'string' ? val : ''
}

function num(val: unknown): number {
  return typeof val === 'number' ? val : 0
}

// ─── Collectors ───────────────────────────────────────────────────────────────

async function collectHeroes(zip: JSZip, locMap: Map<string, string>): Promise<CatalogHero[]> {
  const paths = zipFilesUnder(zip, 'DB/heroes/')
  const heroes: CatalogHero[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const nameSid = str(entry.name || entry.id)
      const name = loc(locMap, nameSid) ?? loc(locMap, id) ?? nameSid
      heroes.push({
        id,
        name,
        fraction: str(entry.fraction || entry.fractionId || ''),
        icon: str(entry.icon || entry.id),
        classType: str(entry.classType || entry.class || '') || undefined,
      })
    }
  }
  return heroes.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectCreatures(zip: JSZip, locMap: Map<string, string>): Promise<CatalogCreature[]> {
  const paths = zipFilesUnder(zip, 'DB/units/units_logics/')
  const creatures: CatalogCreature[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      // Name pattern: {id}_name in unitsAbility.json
      const name = loc(locMap, `${id}_name`) ?? loc(locMap, id) ?? id

      // ── Stats ──────────────────────────────────────────────────────────────
      const s: Record<string, unknown> = (entry.stats as Record<string, unknown>) ?? {}
      const stats: CreatureStats | undefined = (
        s.hp !== undefined || s.offence !== undefined
      ) ? {
        hp:               num(s.hp),
        offence:          num(s.offence),
        defence:          num(s.defence),
        damageMin:        num(s.damageMin),
        damageMax:        num(s.damageMax),
        initiative:       num(s.initiative),
        speed:            num(s.speed),
        luck:             s.luck   !== undefined ? num(s.luck)   : undefined,
        moral:            s.moral  !== undefined ? num(s.moral)  : undefined,
        actionPoints:     s.actionPoints        !== undefined ? num(s.actionPoints)        : undefined,
        numCounters:      s.numCounters         !== undefined ? num(s.numCounters)         : undefined,
        energyPerCast:    s.energyPerCast       !== undefined ? num(s.energyPerCast)       : undefined,
        energyPerRound:   s.energyPerRound      !== undefined ? num(s.energyPerRound)      : undefined,
        energyPerTakeDamage: s.energyPerTakeDamage !== undefined ? num(s.energyPerTakeDamage) : undefined,
      } : undefined

      // ── Cost ───────────────────────────────────────────────────────────────
      const unitCost = entry.unitCost as Record<string, unknown> | undefined
      const costArr = unitCost?.costResArray
      const cost: { resource: string; amount: number }[] | undefined =
        Array.isArray(costArr) && costArr.length > 0
          ? costArr.map((c: Record<string, unknown>) => ({ resource: str(c.name), amount: num(c.cost) }))
          : undefined

      creatures.push({
        id,
        name,
        fraction: str(entry.fraction || entry.fractionId || ''),
        tier: num(entry.tier || entry.level),
        icon: str(entry.icon || entry.id) || undefined,
        stats,
        cost,
        squadValue:  entry.squadValue  !== undefined ? num(entry.squadValue)  : undefined,
        nativeBiome: entry.nativeBiome !== undefined ? str(entry.nativeBiome) : undefined,
        baseSid:     entry.baseSid     !== undefined ? str(entry.baseSid)     : undefined,
        upgradeSid:  entry.upgradeSid  !== undefined ? str(entry.upgradeSid)  : undefined,
        aiType:      entry.ai          !== undefined ? str(entry.ai)          : undefined,
      })
    }
  }
  return creatures.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectArtifacts(zip: JSZip, locMap: Map<string, string>): Promise<CatalogArtifact[]> {
  const paths = zipFilesUnder(zip, 'DB/items/items/')
  const artifacts: CatalogArtifact[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const nameSid = str(entry.name || entry.id)
      const name = loc(locMap, nameSid) ?? loc(locMap, id) ?? nameSid
      artifacts.push({
        id,
        name,
        icon: str(entry.icon || entry.id),
        slot: str(entry.slot || '') || undefined,
        rarity: str(entry.rarity || '') || undefined,
      })
    }
  }
  return artifacts.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectSpells(zip: JSZip, locMap: Map<string, string>): Promise<CatalogSpell[]> {
  const paths = zipFilesUnder(zip, 'DB/magics/')
  const spells: CatalogSpell[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const nameSid = str(entry.name || entry.id)
      const name = loc(locMap, nameSid) ?? loc(locMap, id) ?? nameSid
      spells.push({
        id,
        name,
        icon: str(entry.icon || entry.id),
        school: str(entry.school || entry.element || '') || undefined,
        rank: typeof entry.rank === 'number' ? entry.rank : undefined,
      })
    }
  }
  return spells.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectSkills(zip: JSZip, locMap: Map<string, string>): Promise<CatalogSkill[]> {
  const paths = zipFilesUnder(zip, 'DB/heroes_skills/skills/')
  const skills: CatalogSkill[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const nameSid = str(entry.name || entry.id)
      const name = loc(locMap, nameSid) ?? loc(locMap, id) ?? nameSid
      skills.push({
        id,
        name,
        icon: str(entry.icon || entry.id) || undefined,
      })
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectBuffs(zip: JSZip, locMap: Map<string, string>): Promise<CatalogBuff[]> {
  const paths = zipFilesUnder(zip, 'DB/buffs/')
  const buffs: CatalogBuff[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      const nameSid = str(entry.name_ || entry.name || entry.id)
      const name = loc(locMap, nameSid) ?? loc(locMap, id) ?? nameSid
      buffs.push({
        id,
        name,
        icon: str(entry.icon || entry.id) || undefined,
      })
    }
  }
  return buffs.sort((a, b) => a.name.localeCompare(b.name))
}

const MAP_OBJECT_FILES: Array<{
  file: string
  category: CatalogMapObject['category']
  isInteractable: boolean
}> = [
  { file: 'DB/map/objects/4_interactables.json', category: 'interactables', isInteractable: true },
  { file: 'DB/map/objects/3_resources.json',     category: 'resources',     isInteractable: false },
  { file: 'DB/map/objects/1_environments.json',  category: 'environments',  isInteractable: false },
  { file: 'DB/map/objects/7_spawns.json',        category: 'spawns',        isInteractable: false },
]

async function collectMapObjects(zip: JSZip, locMap: Map<string, string>): Promise<CatalogMapObject[]> {
  const mapObjects: CatalogMapObject[] = []
  const seen = new Set<string>()

  for (const { file, category, isInteractable: defaultInteractable } of MAP_OBJECT_FILES) {
    const entries = await readJsonArray(zip, file)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      // Name pattern: {id}_name in mapObjects.json
      const name = loc(locMap, `${id}_name`) ?? loc(locMap, id) ?? id
      // interactables.json entries may have their own isInteractable flag
      const entryInteractable =
        category === 'interactables'
          ? entry.isInteractable !== false
          : defaultInteractable
      mapObjects.push({
        id,
        name,
        tag: str(entry.tag || entry.objectType || '') || undefined,
        category,
        isInteractable: Boolean(entryInteractable),
        icon: str(entry.icon || '') || undefined,
      })
    }
  }
  return mapObjects.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectFactions(zip: JSZip, locMap: Map<string, string>): Promise<CatalogFaction[]> {
  const paths = zipFilesUnder(zip, 'DB/fractions/')
  const factions: CatalogFaction[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      // Faction name field is already a localized string per the plan
      const name = str(entry.name || id)
      factions.push({
        id,
        name: loc(locMap, name) ?? name,
        icon: str(entry.icon || '') || undefined,
      })
    }
  }
  return factions.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectDialogs(zip: JSZip, locMap: Map<string, string>): Promise<CatalogDialog[]> {
  const paths = zipFilesUnder(zip, 'DB/dialogs/dialogs/')
  const dialogs: CatalogDialog[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const entries = await readJsonArray(zip, path)
    for (const entry of entries) {
      const id = str(entry.id)
      if (!id || seen.has(id)) continue
      seen.add(id)

      const slides: CatalogDialogSlide[] = []
      const rawSlides = Array.isArray(entry.slides) ? (entry.slides as Record<string, unknown>[]) : []

      for (const slide of rawSlides) {
        const slideId = str(slide.id || '')
        // Resolve speaker from title.sid
        const titleObj = slide.title as Record<string, unknown> | undefined
        const speakerSid = str(titleObj?.sid || '')
        const speakerName = speakerSid ? (loc(locMap, speakerSid) ?? speakerSid) : undefined
        // Resolve text from text.sid
        const textObj = slide.text as Record<string, unknown> | undefined
        const textSid = str(textObj?.sid || '')
        const text = textSid ? (loc(locMap, textSid) ?? undefined) : undefined

        slides.push({ id: slideId, text, speakerName })
      }

      const firstText = slides.find((s) => s.text)?.text
      dialogs.push({
        id,
        slideCount: slides.length,
        firstText,
        slides,
      })
    }
  }
  return dialogs.sort((a, b) => a.id.localeCompare(b.id))
}

// ─── Main build function ──────────────────────────────────────────────────────

export async function buildCatalog(
  zip: JSZip,
  sourceHint: string,
): Promise<GameCatalog> {
  const locMap = await loadLocalization(zip)

  const [heroes, creatures, artifacts, spells, skills, buffs, mapObjects, factions, dialogs] =
    await Promise.all([
      collectHeroes(zip, locMap),
      collectCreatures(zip, locMap),
      collectArtifacts(zip, locMap),
      collectSpells(zip, locMap),
      collectSkills(zip, locMap),
      collectBuffs(zip, locMap),
      collectMapObjects(zip, locMap),
      collectFactions(zip, locMap),
      collectDialogs(zip, locMap),
    ])

  return {
    version: CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceHint,
    heroes,
    creatures,
    artifacts,
    spells,
    skills,
    buffs,
    mapObjects,
    factions,
    dialogs,
  }
}
