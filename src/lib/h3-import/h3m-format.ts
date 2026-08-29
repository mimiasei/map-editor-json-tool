// ─── H3M scenario header (version detection, players, victory/loss) ─────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_format.py`, used with the author's explicit permission. Byte widths and
// version gates here are load-bearing — see CLAUDE.md's H3-import gotchas.

import { BinaryReader } from './binary-reader'

export const H3M_VERSION_ROE = 14
export const H3M_VERSION_AB = 21
export const H3M_VERSION_SOD = 28
export const H3M_VERSION_HOTA = 32
/** HotA's own "format level" (a monotonic feature counter bundled with the
 *  file, independent of the `version` field above, which stays 32 for every
 *  HotA release) — confirmed against VCMI's own authoritative
 *  `MapFormatFeaturesH3M::getFeaturesHOTA()` (lib/mapping/MapFeaturesH3M.cpp):
 *  every level in this range shares the same `heroesCount=215`/27-byte
 *  allowed-heroes-mask width this importer already assumes (widening to
 *  levels 0-6 would additionally require different hero/artifact byte
 *  widths this port hasn't implemented, so THOSE are still rejected).
 *  Real, common HotA releases include ALL of 7/8/9 — hard-locking to
 *  exactly 9 (the previous, overly narrow gate here) rejected real, live
 *  maps at level 7/8 for no wire-format reason. */
export const H3M_HOTA_FORMAT_LEVEL_MIN = 7
export const H3M_HOTA_FORMAT_LEVEL_MAX = 9
export const H3M_HOTA_HERO_COUNT = 215
export const SUPPORTED_H3M_VERSIONS = new Set([H3M_VERSION_ROE, H3M_VERSION_AB, H3M_VERSION_SOD, H3M_VERSION_HOTA])
/** The 5 classic size presets (S/M/L/XL/Giant) are what the stock map editor
 *  UI offers, but VCMI's own header reader places no such restriction on the
 *  raw size field (`mapHeader->height = mapHeader->width =
 *  reader->readInt32()` — no allowlist, no range check) — real HotA maps
 *  confirm this: two real maps this session ("A New Day Tomorrow.h3m" size
 *  180, "Daggerwin Valley.h3m"/"Barren Lands.h3m" size 216) use sizes
 *  outside the classic 5-value preset list, using a custom/mod-provided map
 *  size the editor's own preset dropdown doesn't offer but the format
 *  itself never restricted. A hard allowlist here was a real bug (rejecting
 *  legitimate, real files), not a meaningful validation — replaced with a
 *  sane upper bound purely to fail closed on true corruption/garbage. */
export const MAX_PLAUSIBLE_H3M_SIZE = 400
export function isPlausibleH3mSize(size: number): boolean {
  return Number.isInteger(size) && size > 0 && size <= MAX_PLAUSIBLE_H3M_SIZE
}

export const VICTORY_ARTIFACT = 0
export const VICTORY_GATHERTROOP = 1
export const VICTORY_GATHERRESOURCE = 2
export const VICTORY_BUILDCITY = 3
export const VICTORY_BUILDGRAIL = 4
export const VICTORY_BEATHERO = 5
export const VICTORY_CAPTURECITY = 6
export const VICTORY_BEATMONSTER = 7
export const VICTORY_TAKEDWELLINGS = 8
export const VICTORY_TAKEMINES = 9
export const VICTORY_TRANSPORTITEM = 10
/** Confirmed against VCMI's own authoritative `EVictoryConditionType` enum
 *  (lib/mapping/MapFormatH3M.h): both 11 and 12 are HotA-only additions
 *  (`HOTA_ELIMINATE_ALL_MONSTERS`/`HOTA_SURVIVE_FOR_DAYS`) — classic H3
 *  (RoE/AB/SoD) only ever produces victory types 0-10. 11 happens to read
 *  the same shape our name assumed (0 extra bytes); 12 does NOT — see
 *  the read site below. */
export const VICTORY_DEFEAT_ALL_MONSTERS = 11
export const VICTORY_SURVIVE_TIME = 12
export const VICTORY_WINSTANDARD = 255

export const LOSS_CASTLE = 0
export const LOSS_HERO = 1
export const LOSS_TIMEEXPIRES = 2
export const LOSS_STANDARD = 255

export interface Int3 { x: number; z: number; y: number }

export interface HotaHeaderExtension {
  formatLevel: number
  release: { major: number; minor: number; patch: number }
  isMirrorMap: boolean
  isArenaMap: boolean
  terrainTypesCount: number
  townTypesCount: number
  allowedDifficultiesMask: number
  canHireDefeatedHeroes: boolean
  forceMatchingVersion: boolean
}

/** HotA fields between the format id and the classic H3M header — each one
 *  individually gated by `formatLevel`, matching VCMI's own progressive
 *  `levelHOTA1/2/5/7/8/9` feature checks (`MapFormatH3M.cpp::readHeader()`)
 *  EXACTLY rather than reading a fixed set of fields unconditionally. Only
 *  format levels 7-9 are supported (see `H3M_HOTA_FORMAT_LEVEL_MIN/MAX`) —
 *  every field below is present at level 7 except `release`/
 *  `forceMatchingVersion` (level 8+ only) and the trailing `unknown` marker
 *  (level 9 only). Getting any one of these gates wrong misaligns every
 *  byte read after it — including the whole rest of the header (players,
 *  victory/loss, teams) and, transitively, the terrain/object-table
 *  location this importer's own scan-based `locateH3mTerrainAndObjects`
 *  depends on. */
function readHotaHeaderExtension(reader: BinaryReader, version: number): HotaHeaderExtension | null {
  if (version !== H3M_VERSION_HOTA) return null

  const formatLevel = reader.readU32()
  if (formatLevel < H3M_HOTA_FORMAT_LEVEL_MIN || formatLevel > H3M_HOTA_FORMAT_LEVEL_MAX) {
    throw new Error(`Unsupported HotA format level ${formatLevel}; expected ${H3M_HOTA_FORMAT_LEVEL_MIN}-${H3M_HOTA_FORMAT_LEVEL_MAX}`)
  }

  // levelHOTA8 (formatLevel > 7): release major/minor/patch, informational
  // only (VCMI itself never validates it against a specific release).
  const release = formatLevel > 7
    ? { major: reader.readU32(), minor: reader.readU32(), patch: reader.readU32() }
    : { major: 0, minor: 0, patch: 0 }

  // levelHOTA1 (formatLevel > 0): always true in the 7-9 range we accept.
  const isMirrorMap = reader.readBool()
  const isArenaMap = reader.readBool()
  if (isMirrorMap || isArenaMap) {
    throw new Error(`Unsupported HotA map mode: ${[isMirrorMap && 'mirror', isArenaMap && 'arena'].filter(Boolean).join(', ')}`)
  }

  // levelHOTA2 (formatLevel > 1): always true in the 7-9 range we accept.
  // Not validated against an expected count — VCMI itself only *warns* on a
  // mismatch here (never throws; its own source calls the terrain/town-type-
  // count vs. real-catalog-count relationship "not related to factions?"),
  // and real maps confirm it: two real HotA maps this session ("Scorched
  // Earth", "The Devil Is in the Detail") both carry townTypesCount=11, not
  // the naively-expected 12. Hard-failing on this was a real bug, not a
  // legitimate validation — these fields exist here only to stay byte-
  // aligned for what follows, same as VCMI's own tolerant read.
  const terrainTypesCount = reader.readU32()

  // levelHOTA5 (formatLevel > 4): always true in the 7-9 range we accept.
  const townTypesCount = reader.readU32()
  const allowedDifficultiesMask = reader.readU8()

  // levelHOTA7 (formatLevel > 6): always true in the 7-9 range we accept.
  const canHireDefeatedHeroes = reader.readBool()

  // levelHOTA8 (formatLevel > 7): level 8-9 only.
  const forceMatchingVersion = formatLevel > 7 ? reader.readBool() : false

  // levelHOTA9 (formatLevel > 8): level 9 only.
  if (formatLevel > 8) {
    const unknown = reader.readU32()
    if (unknown !== 0) throw new Error(`Unsupported nonzero HotA format-9 header field ${unknown}`)
  }

  return { formatLevel, release, isMirrorMap, isArenaMap, terrainTypesCount, townTypesCount, allowedDifficultiesMask, canHireDefeatedHeroes, forceMatchingVersion }
}

function readInt3(reader: BinaryReader): Int3 {
  const x = reader.readU8(), y = reader.readU8(), z = reader.readU8()
  return { x, y, z }
}

export interface H3mPlayer {
  index: number
  playable: boolean
  canHuman: boolean
  canComputer: boolean
  aiTactic?: number
  factionsMask?: number[]
  isFactionRandom?: boolean
  mainTown?: { generateHero: boolean } & Int3 | null
  hasRandomHero?: boolean
  mainCustomHeroId?: number
  customHero?: { portrait: number; name: string } | null
  heroesNames?: { id: number; name: string }[]
}

export interface H3mVictoryCondition {
  type: number
  allowNormalVictory: boolean | null
  appliesToComputer: boolean | null
  special: Record<string, unknown>
}

export interface H3mLossCondition {
  type: number
  special: Record<string, unknown>
}

export interface H3mScenarioHeader {
  version: number
  anyPlayers: boolean
  size: number
  hasUnderground: boolean
  layers: number
  title: string
  description: string
  difficulty: number
  levelLimit: number
  hota: HotaHeaderExtension | null
  players: H3mPlayer[]
  victory: H3mVictoryCondition
  loss: H3mLossCondition
  teamsCount: number
  teams: number[]
  allowedHeroesMask: number[]
  campaignHeroPlaceholders: number[]
  headerPlayersEndOffset: number
}

/** Decode players + victory/loss from the H3M header (VCMI-shaped AB/RoE/SoD).
 *  Empty-player padding: RoE contributes 6 unused bytes, AB adds another 6
 *  (12 total), SoD adds 1 more — proven against real stock maps upstream. */
export function decodeH3mScenarioHeader(data: Uint8Array): H3mScenarioHeader {
  const reader = new BinaryReader(data)
  const version = reader.readU32()
  if (!SUPPORTED_H3M_VERSIONS.has(version)) {
    throw new Error(`Unsupported H3M version ${version}`)
  }
  const hota = readHotaHeaderExtension(reader, version)
  const anyPlayers = reader.readBool()
  const size = reader.readU32()
  if (!isPlausibleH3mSize(size)) throw new Error(`Implausible H3M map size ${size}`)
  const hasUnderground = reader.readBool()
  const title = reader.readString(256)
  const description = reader.readString(4096)
  const difficulty = reader.readU8()
  const isAb = version >= H3M_VERSION_AB
  const isSod = version >= H3M_VERSION_SOD
  const levelLimit = isAb ? reader.readU8() : 0
  const factionsBytes = isAb ? 2 : 1
  let heroesBytes = version === H3M_VERSION_HOTA ? 27 : (isAb ? 20 : 16)

  const players: H3mPlayer[] = []
  for (let index = 0; index < 8; index++) {
    const canHuman = reader.readBool()
    const canComputer = reader.readBool()
    if (!(canHuman || canComputer)) {
      let skipN = 6
      if (isAb) skipN += 6
      if (isSod) skipN += 1
      reader.skip(skipN)
      players.push({ index, playable: false, canHuman, canComputer })
      continue
    }

    const aiTactic = reader.readU8()
    if (isSod) reader.skip(1) // faction selectable
    const factionsMask = Array.from(reader.readBytes(factionsBytes))
    const isFactionRandom = reader.readBool()
    const hasMainTown = reader.readBool()
    let mainTown: H3mPlayer['mainTown'] = null
    if (hasMainTown) {
      let generateHero = true
      if (isAb) {
        generateHero = reader.readBool()
        reader.skip(1) // unused starting town type
      }
      mainTown = { generateHero, ...readInt3(reader) }
    }
    const hasRandomHero = reader.readBool()
    const mainCustomHeroId = reader.readU8()
    let customHero: H3mPlayer['customHero'] = null
    if (mainCustomHeroId !== 0xFF) {
      customHero = { portrait: reader.readU8(), name: reader.readString(256) }
    }
    const heroesNames: { id: number; name: string }[] = []
    if (isAb) {
      reader.skip(1)
      const heroCount = reader.readU32()
      if (heroCount > 64) throw new Error(`Implausible player heroCount ${heroCount}`)
      for (let i = 0; i < heroCount; i++) {
        heroesNames.push({ id: reader.readU8(), name: reader.readString(256) })
      }
    }
    players.push({ index, playable: true, canHuman, canComputer, aiTactic, factionsMask, isFactionRandom, mainTown, hasRandomHero, mainCustomHeroId, customHero, heroesNames })
  }

  const victoryType = reader.readU8()
  let allowNormalVictory: boolean | null = null
  let appliesToComputer: boolean | null = null
  const victorySpecial: Record<string, unknown> = {}
  if (victoryType !== VICTORY_WINSTANDARD) {
    allowNormalVictory = reader.readBool()
    appliesToComputer = reader.readBool()
    if (victoryType === VICTORY_ARTIFACT) {
      victorySpecial.artifactId = reader.readU8()
      if (isAb) reader.skip(1)
    } else if (victoryType === VICTORY_GATHERTROOP) {
      const creatureId = reader.readU8()
      if (isAb) reader.skip(1)
      victorySpecial.creatureId = creatureId
      victorySpecial.count = reader.readU32()
    } else if (victoryType === VICTORY_GATHERRESOURCE) {
      victorySpecial.resourceId = reader.readU8()
      victorySpecial.count = reader.readU32()
    } else if (victoryType === VICTORY_BUILDCITY) {
      victorySpecial.position = readInt3(reader)
      victorySpecial.hallLevel = reader.readU8()
      victorySpecial.castleLevel = reader.readU8()
    } else if ([VICTORY_BUILDGRAIL, VICTORY_BEATHERO, VICTORY_CAPTURECITY, VICTORY_BEATMONSTER].includes(victoryType)) {
      victorySpecial.position = readInt3(reader)
    } else if (victoryType === VICTORY_TAKEDWELLINGS || victoryType === VICTORY_TAKEMINES) {
      // no extra fields
    } else if (victoryType === VICTORY_TRANSPORTITEM) {
      victorySpecial.artifactId = reader.readU8()
      victorySpecial.position = readInt3(reader)
    } else if (victoryType === VICTORY_SURVIVE_TIME) {
      // A real bug found this session: VCMI's actual HOTA_SURVIVE_FOR_DAYS
      // reads `reader->readUInt32()` (4 bytes) — this codebase previously
      // assumed a classic-H3-style 2-byte day count, which doesn't apply
      // here since (per the enum doc comment above) this victory type is a
      // HotA-only addition with its own real field width, confirmed against
      // a real HotA map ("Beware of Demons!.h3m") whose header decoded to
      // total garbage (teamsCount=198, heroesCount=2147202047) two bytes
      // after this field — exactly the drift a 2-bytes-too-few read causes.
      victorySpecial.days = reader.readU32()
    } else if (victoryType === VICTORY_DEFEAT_ALL_MONSTERS) {
      // no extra fields
    } else {
      throw new Error(`Unsupported victory condition type ${victoryType}`)
    }
  }

  const lossType = reader.readU8()
  const lossSpecial: Record<string, unknown> = {}
  if (lossType !== LOSS_STANDARD) {
    if (lossType === LOSS_CASTLE || lossType === LOSS_HERO) {
      lossSpecial.position = readInt3(reader)
    } else if (lossType === LOSS_TIMEEXPIRES) {
      lossSpecial.days = reader.readU16()
    } else {
      throw new Error(`Unsupported loss condition type ${lossType}`)
    }
  }

  const teamsCount = reader.readU8()
  let teams: number[] = []
  if (teamsCount) {
    teams = Array.from(reader.readBytes(8))
  }
  if (version === H3M_VERSION_HOTA) {
    // A real, in-file count, not a format-level-derived constant — VCMI's
    // own `readBitmaskHeroesSized` reads this exact field and only asserts
    // `heroesCount <= features.heroesCount` (a ceiling, matching whichever
    // hero roster the format level supports), never an exact match. Two
    // real format-level-8 maps this session ("Scorched Earth", "The Devil
    // Is in the Detail") both carry 198 here (a legitimate, self-consistent
    // earlier-roster value), not the naively-assumed 215 — hard-requiring
    // exact equality was a real bug, not a legitimate validation.
    const heroesCount = reader.readU32()
    if (heroesCount > H3M_HOTA_HERO_COUNT) {
      throw new Error(`Implausible HotA hero count ${heroesCount} (expected at most ${H3M_HOTA_HERO_COUNT})`)
    }
    heroesBytes = Math.ceil(heroesCount / 8)
  }
  const allowedHeroesMask = Array.from(reader.readBytes(heroesBytes))
  let campaignHeroPlaceholders: number[] = []
  if (isAb) {
    const placeholderCount = reader.readU32()
    if (placeholderCount > 200) throw new Error(`Implausible campaign hero placeholder count ${placeholderCount}`)
    campaignHeroPlaceholders = Array.from({ length: placeholderCount }, () => reader.readU8())
  }

  return {
    version, anyPlayers, size, hasUnderground, layers: hasUnderground ? 2 : 1,
    title, description, difficulty, levelLimit, hota,
    players,
    victory: { type: victoryType, allowNormalVictory, appliesToComputer, special: victorySpecial },
    loss: { type: lossType, special: lossSpecial },
    teamsCount, teams, allowedHeroesMask, campaignHeroPlaceholders,
    headerPlayersEndOffset: reader.offset,
  }
}

export { readHotaHeaderExtension }
