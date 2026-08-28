// ─── H3M scenario header (version detection, players, victory/loss) ─────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_format.py`, used with the author's explicit permission. Byte widths and
// version gates here are load-bearing — see CLAUDE.md's H3-import gotchas.

import { BinaryReader } from './binary-reader'

export const H3M_VERSION_ROE = 14
export const H3M_VERSION_AB = 21
export const H3M_VERSION_SOD = 28
export const H3M_VERSION_HOTA = 32
export const H3M_HOTA_FORMAT_LEVEL_1_8 = 9
export const H3M_HOTA_1_8_HERO_COUNT = 215
export const SUPPORTED_H3M_VERSIONS = new Set([H3M_VERSION_ROE, H3M_VERSION_AB, H3M_VERSION_SOD, H3M_VERSION_HOTA])
export const SUPPORTED_H3M_SIZES = new Set([36, 72, 108, 144, 252])

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

/** HotA 1.8 fields between the format id and the classic H3M header. Only
 *  format level 9 ("HotA 1.8") is supported — older HotA layouts have
 *  different feature widths and are rejected rather than misread as SoD. */
function readHotaHeaderExtension(reader: BinaryReader, version: number): HotaHeaderExtension | null {
  if (version !== H3M_VERSION_HOTA) return null

  const formatLevel = reader.readU32()
  if (formatLevel !== H3M_HOTA_FORMAT_LEVEL_1_8) {
    throw new Error(`Unsupported HotA format level ${formatLevel}; expected ${H3M_HOTA_FORMAT_LEVEL_1_8} (HotA 1.8)`)
  }
  const release = { major: reader.readU32(), minor: reader.readU32(), patch: reader.readU32() }
  if (release.major !== 1 || release.minor !== 8) {
    throw new Error(`Unsupported HotA release ${release.major}.${release.minor}.${release.patch}`)
  }
  const isMirrorMap = reader.readBool()
  const isArenaMap = reader.readBool()
  if (isMirrorMap || isArenaMap) {
    throw new Error(`Unsupported HotA map mode: ${[isMirrorMap && 'mirror', isArenaMap && 'arena'].filter(Boolean).join(', ')}`)
  }
  const terrainTypesCount = reader.readU32()
  const townTypesCount = reader.readU32()
  const allowedDifficultiesMask = reader.readU8()
  const canHireDefeatedHeroes = reader.readBool()
  const forceMatchingVersion = reader.readBool()
  const unknown = reader.readU32()

  if (terrainTypesCount !== 12) throw new Error(`Unsupported HotA terrain type count ${terrainTypesCount}; expected 12`)
  if (townTypesCount !== 12) throw new Error(`Unsupported HotA town type count ${townTypesCount}; expected 12`)
  if (allowedDifficultiesMask !== 0 && allowedDifficultiesMask !== 31) {
    throw new Error(`Unsupported HotA allowed difficulties mask 0x${allowedDifficultiesMask.toString(16)}`)
  }
  if (unknown !== 0) throw new Error(`Unsupported nonzero HotA 1.8 header field ${unknown}`)

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
  if (!SUPPORTED_H3M_SIZES.has(size)) throw new Error(`Unsupported H3M map size ${size}`)
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
      victorySpecial.days = reader.readU16()
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
    const heroesCount = reader.readU32()
    if (heroesCount !== H3M_HOTA_1_8_HERO_COUNT) {
      throw new Error(`Unsupported HotA hero count ${heroesCount}; expected ${H3M_HOTA_1_8_HERO_COUNT}`)
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
