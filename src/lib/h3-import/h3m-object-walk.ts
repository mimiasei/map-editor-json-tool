// ─── H3M object instance table walker ────────────────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_object_walk.py`, used with the author's explicit permission. Every
// object payload must be handled by an explicit decoder or an explicit
// no-payload allowlist entry (h3m-object-registry.ts) — the walk throws on
// the first unsupported record rather than guessing/scanning ahead.
//
// Deliberately NOT ported: the RoE campaign-embedded "briefing tail" special
// case (upstream's `_looks_like_synthetic_roe_campaign_briefing` family) —
// only relevant to campaign .h3c-embedded maps, out of scope for importing
// standalone .h3m files. A map that actually needs it fails closed with a
// clear "unsupported object payload" error rather than being silently
// misparsed.

import { BinaryReader } from './binary-reader'
import * as h3obj from './h3m-object-registry'
import { H3M_VERSION_AB, H3M_VERSION_SOD, H3M_VERSION_HOTA } from './h3m-format'

export const RESOURCES_COUNT = 7
const SKILLS_BYTES = 4
const SPELLS_BYTES = 9
const BUILDINGS_BYTES = 6
const CREATURE_SLOTS = 7
const ARTIFACT_SLOTS_AB = 19
/** RoE's plain (non-hero-equipment-slot) artifact/creature identifier width
 *  is u8, not u16 — confirmed against VCMI's `MapReaderH3M::readArtifact()`/
 *  `readCreature()` (`features.levelAB ? u16 : u8`), independent verification
 *  of a real bug found this session (see `readArtifactId`/`readCreatureId`
 *  below): every "granted/required artifact" and "reward creature" field in
 *  a RoE map's Pandora's Box, Event, Monster-guard, and Seer Hut payloads
 *  was being read 1 byte too wide, silently desyncing the object walk for
 *  the rest of the file. Not to be confused with `readHeroArtifactSet`'s own
 *  separate RoE/AB/SoD/HotA equipment-slot widths (18/18/19/19 slots of
 *  u8/u16/u16/u32) — a different real field with its own real versioning. */
const ARTIFACT_NONE_U8 = 0xFF

export const H3M_VERSION_HOTA_MIN = 29
export function isHotaMapVersion(version: number): boolean {
  return version >= H3M_VERSION_HOTA_MIN
}

export class UnsupportedObjectPayloadError extends Error {
  constructor(public readonly status: string, message: string) { super(message) }
}

/** Every field an object-instance record can carry — a superset across every
 *  object family, matching this codebase's own `[key: string]: unknown`
 *  catch-all convention (see `RawMapBlock2` in map-parser.ts) rather than a
 *  discriminated union per object kind. */
export interface H3mObjectRecord {
  index: number
  recordOffset: number
  x: number
  y: number
  z: number
  layer: number
  key: string
  templateIndex: number
  templateAnimation: string
  templateBlockMask: number[]
  templateVisitMask: number[]
  templateObjectId: number
  templateSubtype: number
  h3mVersion: number
  payloadKind?: string
  recordEndOffset?: number
  recordBytes?: number
  [key: string]: unknown
}

export class H3mWalker {
  readonly reader: BinaryReader
  constructor(readonly data: Uint8Array) { this.reader = new BinaryReader(data) }

  tell(): number { return this.reader.offset }
  seek(pos: number): void { this.reader.seek(pos) }
  skip(n: number): void { this.reader.skip(n) }
  readU8(): number { return this.reader.readU8() }
  readI8(): number { return this.reader.readI8() }
  readBool(): boolean { return this.reader.readBool() }
  readU16(): number { return this.reader.readU16() }
  readI16(): number { const v = this.readU16(); return v >= 0x8000 ? v - 0x10000 : v }
  readU32(): number { return this.reader.readU32() }
  readI32(): number { return this.reader.readI32() }
  readString(maxLength = 4096): string { return this.reader.readString(maxLength) }
  readBytes(n: number): Uint8Array { return this.reader.readBytes(n) }
  readBitmaskHex(length: number): string { return Array.from(this.readBytes(length)).map((b) => b.toString(16).padStart(2, '0')).join('') }

  skipResources(): void { this.skip(RESOURCES_COUNT * 4) }
  readResources(): number[] { return Array.from({ length: RESOURCES_COUNT }, () => this.readU32()) }

  /** Plain (non-hero-equipment-slot) artifact identifier — RoE is u8,
   *  AB+ is u16 (VCMI's `MapReaderH3M::readArtifact()`); never u32, even on
   *  HotA (that width only applies to `readHeroArtifactSet`'s equipped/
   *  backpack slots, a different field). Returns the raw id including
   *  the "none" sentinel — callers compare against `ARTIFACT_NONE_U8`
   *  themselves when they need to (that sentinel only applies to the RoE
   *  u8 width; every real caller of this method that needs the check only
   *  ever calls it in a RoE-only branch). */
  readArtifactId(h3mVersion: number): number {
    return h3mVersion < H3M_VERSION_AB ? this.readU8() : this.readU16()
  }

  /** Plain (non-inventory-slot) creature identifier — RoE is u8, AB+ is u16
   *  (VCMI's `MapReaderH3M::readCreature()`). */
  readCreatureId(h3mVersion: number): number {
    return h3mVersion < H3M_VERSION_AB ? this.readU8() : this.readU16()
  }

  readCreatureSet(h3mVersion: number): { slot: number; creatureType: number; count: number }[] {
    const stacks: { slot: number; creatureType: number; count: number }[] = []
    for (let slot = 0; slot < CREATURE_SLOTS; slot++) {
      const creatureType = this.readCreatureId(h3mVersion)
      const count = this.readU16()
      stacks.push({ slot, creatureType, count })
    }
    return stacks
  }

  readHeroArtifactSet(h3mVersion: number): { hasArtifactSet: boolean; equippedArtifacts: number[]; backpackArtifacts: number[]; backpackArtifactCount: number } {
    const hasArtifactSet = this.readBool()
    let equipped: number[] = []
    let backpack: number[] = []
    if (hasArtifactSet) {
      const roe = h3mVersion < H3M_VERSION_AB
      const sod = h3mVersion >= H3M_VERSION_SOD
      if (roe) {
        equipped = Array.from({ length: 18 }, () => this.readU8())
      } else {
        const slotCount = sod ? ARTIFACT_SLOTS_AB : 18
        equipped = h3mVersion === H3M_VERSION_HOTA
          ? Array.from({ length: slotCount }, () => this.readU32())
          : Array.from({ length: slotCount }, () => this.readU16())
      }
      const backpackCount = this.readU16()
      if (backpackCount > 256) throw new Error(`Implausible hero backpack artifact count ${backpackCount}`)
      if (roe) backpack = Array.from({ length: backpackCount }, () => this.readU8())
      else if (h3mVersion === H3M_VERSION_HOTA) backpack = Array.from({ length: backpackCount }, () => this.readU32())
      else backpack = Array.from({ length: backpackCount }, () => this.readU16())
    }
    return { hasArtifactSet, equippedArtifacts: equipped, backpackArtifacts: backpack, backpackArtifactCount: backpack.length }
  }

  skipMessageAndGuards(h3mVersion: number): { hasMessage: boolean; message: string | null; hasGuards: boolean; guardStacks?: { slot: number; creatureType: number; count: number }[] } {
    const hasMessage = this.readBool()
    let message: string | null = null
    let hasGuards = false
    let guardStacks: { slot: number; creatureType: number; count: number }[] | undefined
    if (hasMessage) {
      message = this.readString(1_000_000)
      hasGuards = this.readBool()
      if (hasGuards) guardStacks = this.readCreatureSet(h3mVersion)
      this.skip(4)
    }
    return { hasMessage, message, hasGuards, guardStacks }
  }

  skipBoxContent(h3mVersion: number): Record<string, unknown> {
    const messageAndGuards = this.skipMessageAndGuards(h3mVersion)
    const experience = this.readU32()
    const mana = this.readU32()
    const morale = this.readI8()
    const luck = this.readI8()
    const resources = this.readResources()
    const primarySkill = this.readU32()
    const skillCount = this.readU8()
    if (skillCount > 64) throw new Error(`Implausible box skill reward count ${skillCount}`)
    const skills = Array.from({ length: skillCount }, () => ({ skillId: this.readU8(), level: this.readU8() }))
    const artifactCount = this.readU8()
    if (artifactCount > 128) throw new Error(`Implausible box artifact reward count ${artifactCount}`)
    // Plain readArtifact() width (RoE u8 / AB+ u16) — never u32, even on
    // HotA. HotA instead appends a separate 2-byte scroll-spell id after
    // EVERY artifact entry (VCMI's `features.levelHOTA5` branch), not a
    // wider artifact-id field. Both were wrong here (a real bug, not a
    // simplification): RoE maps were being over-read by 1 byte per granted
    // artifact, HotA maps by 2 bytes per artifact plus a missing 2-byte
    // scroll field — either desyncs every record after it in the file.
    const artifacts = Array.from({ length: artifactCount }, () => {
      const artifactId = this.readArtifactId(h3mVersion)
      const scrollSpellId = h3mVersion === H3M_VERSION_HOTA ? this.readU16() : undefined
      return { artifactId, scrollSpellId }
    })
    const spellCount = this.readU8()
    if (spellCount > 128) throw new Error(`Implausible box spell reward count ${spellCount}`)
    const spells = Array.from({ length: spellCount }, () => this.readU8())
    const creatureCount = this.readU8()
    if (creatureCount > 64) throw new Error(`Implausible box creature reward count ${creatureCount}`)
    const creatures = Array.from({ length: creatureCount }, () => ({ creatureType: this.readCreatureId(h3mVersion), count: this.readU16() }))
    this.skip(8)
    return {
      messageAndGuards,
      rewards: { experience, mana, morale, luck, resources, primarySkill, skills, artifacts, spells, creatures },
    }
  }

  skipEventCommon(h3mVersion: number): Record<string, unknown> {
    const name = this.readString()
    const message = this.readString()
    const resources = this.readResources()
    const players = this.readU8()
    const humanAffected = h3mVersion >= H3M_VERSION_SOD ? this.readBool() : true
    const computerAffected = this.readBool()
    const firstOccurrence = this.readU16()
    const nextOccurrence = this.readU16()
    this.skip(16)
    const result: Record<string, unknown> = { name, message, resources, players, humanAffected, computerAffected, firstOccurrence, nextOccurrence }
    if (h3mVersion === H3M_VERSION_HOTA) {
      result.affectedDifficulties = this.readU32()
      const usesEventSystem = this.readBool()
      result.usesEventSystem = usesEventSystem
      if (usesEventSystem) {
        result.eventId = this.readI32()
        result.synchronizeObjects = this.readBool()
      }
    }
    return result
  }
}

type Skipper = (walker: H3mWalker, record: H3mObjectRecord) => Record<string, unknown>

function skipGeneric(_walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  return { payloadKind: 'explicit_no_payload', noPayloadEvidence: h3obj.isNoPayloadObject(record.templateObjectId) }
}

function skipSign(walker: H3mWalker): Record<string, unknown> {
  const message = walker.readString()
  walker.skip(4)
  return { payloadKind: 'sign', message }
}

function skipOwnerU32(walker: H3mWalker, payloadKind: string): Record<string, unknown> {
  return { payloadKind, owner: walker.readU32(), ownerEncoding: 'u32' }
}

function skipAbandonedMine(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const resourceMask = walker.readU32()
  if (isHotaMapVersion(record.h3mVersion)) {
    const hasCustomGuards = walker.readBool()
    walker.skip(hasCustomGuards ? 12 : 12)
  }
  return { payloadKind: 'abandoned_mine', resourceBitmask: resourceMask }
}

function skipMineFamily(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const subtype = record.templateSubtype || 0
  if (record.templateObjectId === h3obj.OBJECT_ABANDONED_MINE || (record.templateObjectId === h3obj.OBJECT_MINE && subtype >= 7)) {
    return skipAbandonedMine(walker, record)
  }
  return skipOwnerU32(walker, 'mine')
}

function skipWitchHut(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  // RoE has zero payload bytes; AB+ adds a 4-byte allowed-skills bitmask.
  // Getting this version gate wrong silently misaligns every later record.
  if (record.h3mVersion >= H3M_VERSION_AB) walker.skip(SKILLS_BYTES)
  return { payloadKind: 'witch_hut' }
}

function skipScholar(walker: H3mWalker): Record<string, unknown> {
  const bonusType = walker.readU8()
  const bonusId = walker.readU8()
  walker.skip(6)
  return { payloadKind: 'scholar', bonusType, bonusId }
}

function skipMonster(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const identifier = record.h3mVersion >= H3M_VERSION_AB ? walker.readU32() : null
  const count = walker.readU16()
  const character = walker.readU8()
  const hasMessage = walker.readBool()
  let message: string | null = null
  let artifact: number | null = null
  let guardResources: number[] | undefined
  if (hasMessage) {
    message = walker.readString()
    guardResources = walker.readResources()
    // Plain readArtifact() width (RoE u8 / AB+ u16) — was hardcoded u16,
    // over-reading every RoE monster's guard-artifact field by 1 byte.
    artifact = walker.readArtifactId(record.h3mVersion)
  }
  const neverFlees = walker.readBool()
  const notGrowingTeam = walker.readBool()
  walker.skip(2)
  const result: Record<string, unknown> = { payloadKind: 'monster', identifier, count, character, hasMessage, message, artifact, guardResources, neverFlees, notGrowingTeam }
  if (isHotaMapVersion(record.h3mVersion)) {
    result.hota = {
      exactAggression: walker.readI32(), joinOnlyForMoney: walker.readBool(), joiningPercentage: walker.readI32(),
      upgradedStackPresence: walker.readI32(), stacksCount: walker.readI32(), sizeByValue: walker.readBool(), targetValue: walker.readI32(),
    }
  }
  return result
}

function skipArtifact(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  if (walker.data[walker.tell()] === 0xff && walker.data[walker.tell() + 1] === 0 && walker.data[walker.tell() + 2] === 0 && walker.data[walker.tell() + 3] === 0) {
    if (isHotaMapVersion(record.h3mVersion)) throw new Error('HotA artifact payload uses unsupported ff000000 sentinel')
    walker.skip(4)
    return { payloadKind: 'artifact', hasMessage: false, message: null, hasGuards: false, sentinel: 'ff000000' }
  }
  const result: Record<string, unknown> = { payloadKind: 'artifact', ...walker.skipMessageAndGuards(record.h3mVersion) }
  if (isHotaMapVersion(record.h3mVersion)) {
    result.pickupMode = walker.readU32()
    result.pickupFlags = walker.readU8()
  }
  return result
}

function skipCreatureGenerator(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  return { payloadKind: 'creature_generator', generatorFamily: h3obj.creatureGeneratorFamily(record.templateObjectId), owner: walker.readU32() }
}

function skipResource(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const messageAndGuards = walker.skipMessageAndGuards(record.h3mVersion)
  const amount = walker.readU32()
  walker.skip(4)
  return { payloadKind: 'resource', messageAndGuards, amount, isRandomResource: record.templateObjectId === h3obj.OBJECT_RANDOM_RESOURCE }
}

function skipHotaRewardWithGarbage(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  if (!isHotaMapVersion(record.h3mVersion)) return skipGeneric(walker, record)
  return { payloadKind: 'hota_reward_with_garbage', content: walker.readI32(), reserved: walker.readI32() }
}

function skipHotaRewardWithArtifact(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  if (!isHotaMapVersion(record.h3mVersion)) return skipGeneric(walker, record)
  return { payloadKind: 'hota_reward_with_artifact', content: walker.readI32(), artifactOrReserved: walker.readU32() }
}

function skipHotaResourceReward(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  if (!isHotaMapVersion(record.h3mVersion)) return skipGeneric(walker, record)
  return { payloadKind: 'hota_resource_reward', content: walker.readI32(), rewardData: walker.readBitmaskHex(14) }
}

function skipHotaCreatureBank(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  if (!isHotaMapVersion(record.h3mVersion)) return skipGeneric(walker, record)
  const guardsPresetIndex = walker.readI32()
  const upgradedStackPresence = walker.readI8()
  const artifactCount = walker.readU32()
  if (artifactCount > 16) throw new Error(`Implausible HotA creature-bank artifact count ${artifactCount}`)
  const artifacts = Array.from({ length: artifactCount }, () => walker.readU32())
  return { payloadKind: 'hota_creature_bank', guardsPresetIndex, upgradedStackPresence, artifacts }
}

function skipHotaFixedExtension(walker: H3mWalker, record: H3mObjectRecord, byteCount: number, payloadKind: string): Record<string, unknown> {
  if (!isHotaMapVersion(record.h3mVersion)) return skipGeneric(walker, record)
  return { payloadKind, extensionData: walker.readBitmaskHex(byteCount) }
}

function skipHotaBoxExtension(walker: H3mWalker): Record<string, unknown> {
  const movementMode = walker.readI32()
  const movementAmount = walker.readI32()
  const affectedDifficulties = walker.readU32()
  const usesEventSystem = walker.readBool()
  const result: Record<string, unknown> = { movementMode, movementAmount, affectedDifficulties, usesEventSystem }
  if (usesEventSystem) { result.eventId = walker.readI32(); result.synchronizeObjects = walker.readBool() }
  return result
}

function skipEvent(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const boxContent = walker.skipBoxContent(record.h3mVersion)
  const playersMask = walker.readU8()
  const computerActivate = walker.readBool()
  const removeAfterVisit = walker.readBool()
  walker.skip(4)
  let humanActivate = true
  let hota: Record<string, unknown> | undefined
  if (record.h3mVersion === H3M_VERSION_HOTA) {
    humanActivate = walker.readBool()
    hota = skipHotaBoxExtension(walker)
  }
  return { payloadKind: 'event', boxContent, playersMask, computerActivate, humanActivate, removeAfterVisit, hota }
}

function skipPandora(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const boxContent = walker.skipBoxContent(record.h3mVersion)
  let hota: Record<string, unknown> | undefined
  if (record.h3mVersion === H3M_VERSION_HOTA) {
    const unknown = walker.readU8()
    hota = { unknown, ...skipHotaBoxExtension(walker) }
  }
  return { payloadKind: 'pandoras_box', boxContent, hota }
}

function skipSpellScroll(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const messageAndGuards = walker.skipMessageAndGuards(record.h3mVersion)
  return { payloadKind: 'spell_scroll', messageAndGuards, spellId: walker.readU32() }
}

function skipShrine(walker: H3mWalker): Record<string, unknown> {
  return { payloadKind: 'shrine', spellId: walker.readU32() }
}

function skipGrail(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const subtype = record.templateSubtype || 0
  if (subtype >= 1000) return skipGeneric(walker, record)
  return { payloadKind: 'grail', radius: walker.readI32() }
}

function skipGarrison(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const owner = walker.readU32()
  const garrisonStacks = walker.readCreatureSet(record.h3mVersion)
  const removableUnits = record.h3mVersion >= H3M_VERSION_AB ? walker.readBool() : true
  walker.skip(8)
  return { payloadKind: 'garrison', owner, garrisonStacks, removableUnits }
}

function skipHeroPlaceholder(walker: H3mWalker): Record<string, unknown> {
  const owner = walker.readU8()
  const heroType = walker.readU8()
  const powerRank = heroType === 0xFF ? walker.readU8() : null
  return { payloadKind: 'hero_placeholder', owner, heroType, powerRank }
}

function skipRandomDwelling(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const objectId = record.templateObjectId
  const owner = walker.readU32()
  let identifier: number | null = null
  if (objectId === h3obj.OBJECT_RANDOM_DWELLING || objectId === h3obj.OBJECT_RANDOM_DWELLING_LVL) {
    identifier = walker.readU32()
    if (identifier === 0) walker.skip(2) // faction bitmask (FACTION_BITMASK_BYTES)
  }
  if (objectId === h3obj.OBJECT_RANDOM_DWELLING || objectId === h3obj.OBJECT_RANDOM_DWELLING_FACTION) {
    walker.skip(2)
  }
  return { payloadKind: 'random_dwelling', dwellingFamily: h3obj.randomDwellingFamily(objectId), owner, identifier }
}

function skipSeerReward(walker: H3mWalker, rewardType: number, h3mVersion: number): void {
  if (rewardType === 1) walker.skip(4)
  else if (rewardType === 2) walker.skip(4)
  else if (rewardType === 3 || rewardType === 4) walker.skip(1)
  else if (rewardType === 5) { walker.skip(1); walker.skip(4) }
  else if (rewardType === 6) walker.skip(2)
  else if (rewardType === 7) walker.skip(2)
  // rewardType 8 (ARTIFACT): plain readArtifact() width (RoE u8 / AB+ u16),
  // was hardcoded u16 — over-read every RoE seer-hut artifact reward by 1
  // byte. rewardType 10 (CREATURE): plain readCreature() width, same fix.
  else if (rewardType === 8) { walker.readArtifactId(h3mVersion); if (h3mVersion === H3M_VERSION_HOTA) walker.skip(2) }
  else if (rewardType === 9) walker.skip(1)
  else if (rewardType === 10) { walker.readCreatureId(h3mVersion); walker.skip(2) }
  else if (rewardType !== 0) throw new Error(`Unsupported seer hut reward type ${rewardType}`)
}

function skipQuestMission(walker: H3mWalker, missionId: number, h3mVersion: number): void {
  if (missionId === 1) walker.skip(4)
  else if (missionId === 2) walker.skip(4)
  else if (missionId === 3 || missionId === 4) walker.skip(4)
  else if (missionId === 5) {
    const artNumber = walker.readU8()
    const artifactBytes = h3mVersion === H3M_VERSION_HOTA ? 4 : 2
    walker.skip(artNumber * artifactBytes)
  } else if (missionId === 6) {
    const typeNumber = walker.readU8()
    walker.skip(typeNumber * 4)
  } else if (missionId === 7) walker.skipResources()
  else if (missionId === 8) walker.skip(1)
  else if (missionId === 9) walker.skip(1)
  else if (missionId === 10) {
    const sub = walker.readU32()
    if (sub === 0) {
      const heroClassCount = walker.readU32()
      if (heroClassCount > 256) throw new Error(`Implausible HotA quest hero-class count ${heroClassCount}`)
      walker.skip(Math.ceil(heroClassCount / 8))
    } else if (sub === 1) walker.skip(4)
    else if (sub === 2) walker.skip(4)
    else if (sub === 3) { walker.skip(4); walker.skip(1) }
    else throw new Error(`Unsupported HotA quest mission sub-id ${sub}`)
  } else if (missionId !== 0) throw new Error(`Unsupported quest mission id ${missionId}`)
}

function skipQuest(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const missionType = walker.readU8()
  if (missionType === 0) return { missionType }
  skipQuestMission(walker, missionType, record.h3mVersion)
  const lastDay = walker.readI32()
  const firstVisitText = walker.readString()
  const nextVisitText = walker.readString()
  const completedText = walker.readString()
  return { missionType, lastDay, firstVisitText, nextVisitText, completedText }
}

function skipSeerHutQuest(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  let quest: Record<string, unknown>
  if (record.h3mVersion >= H3M_VERSION_AB) {
    quest = skipQuest(walker, record)
  } else {
    // RoE-only branch (h3mVersion < AB), so the artifact id is always the
    // u8 width — was read as u16 with the wrong (u16-width) "none" sentinel,
    // over-reading by 1 byte on every RoE seer hut with this quest shape.
    const artifactId = walker.readArtifactId(record.h3mVersion)
    const missionType = artifactId !== ARTIFACT_NONE_U8 ? 5 : 0
    quest = { missionType, requiredArtifact: artifactId }
  }
  if (quest.missionType !== 0) {
    const rewardType = walker.readU8()
    skipSeerReward(walker, rewardType, record.h3mVersion)
    quest.rewardType = rewardType
  } else {
    walker.skip(1)
  }
  return quest
}

function skipSeerHut(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  if (record.h3mVersion === H3M_VERSION_HOTA) {
    const questCount = walker.readU32()
    if (questCount > 64) throw new Error(`Implausible HotA seer-hut quest count ${questCount}`)
    const quests = Array.from({ length: questCount }, () => skipSeerHutQuest(walker, record))
    const repeatableCount = walker.readU32()
    if (repeatableCount > 64) throw new Error(`Implausible HotA repeatable seer-hut quest count ${repeatableCount}`)
    const repeatableQuests = Array.from({ length: repeatableCount }, () => skipSeerHutQuest(walker, record))
    walker.skip(2)
    return { payloadKind: 'seer_hut', quests, repeatableQuests }
  }
  const quest = skipSeerHutQuest(walker, record)
  walker.skip(2)
  return { payloadKind: 'seer_hut', quest }
}

function skipQuestGuard(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  return { payloadKind: 'quest_guard', quest: skipQuest(walker, record) }
}

function skipBorderGate(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const subtype = record.templateSubtype || 0
  if (subtype === 1000) {
    const questPayload = skipQuestGuard(walker, record)
    return { payloadKind: 'border_gate', classicKeymasterStyle: false, quest: questPayload.quest }
  }
  if (subtype === 1001 && isHotaMapVersion(record.h3mVersion)) {
    const content = walker.readI32()
    if (content !== -1) { walker.skip(4); walker.skip(4); walker.skip(1); walker.skip(5) } else walker.skip(14)
    return { payloadKind: 'hota_grave', content }
  }
  if (subtype >= 0 && subtype <= 7) {
    return { payloadKind: 'border_gate', classicKeymasterStyle: true }
  }
  const questPayload = skipQuestGuard(walker, record)
  return { payloadKind: 'border_gate', classicKeymasterStyle: false, quest: questPayload.quest }
}

function skipHeroAbPostPatrol(walker: H3mWalker): Record<string, unknown> {
  let hasCustomBiography = false
  let biography: string | null = null
  let genderRaw = -1
  const peek = walker.data[walker.tell()]
  if (peek === 0 || peek === 1) {
    hasCustomBiography = walker.readBool()
    biography = hasCustomBiography ? walker.readString(4096) : null
    genderRaw = walker.readI8()
  }
  const spell = walker.readI8()
  walker.skip(16)
  return { hasCustomBiography, biography, genderRaw, spell }
}

function skipHeroCommon(walker: H3mWalker, record: H3mObjectRecord, hasIdentifier: boolean, experienceGated: boolean): Record<string, unknown> {
  const h3mVersion = record.h3mVersion
  const identifier = hasIdentifier ? walker.readU32() : null
  const owner = walker.readU8()
  const heroType = walker.readU8()
  const hasName = walker.readBool()
  const name = hasName ? walker.readString(256) : null
  let experience: number
  if (experienceGated) {
    const hasCustomExperience = walker.readBool()
    experience = hasCustomExperience ? walker.readU32() : 0
  } else {
    experience = walker.readU32()
  }
  const hasPortrait = walker.readBool()
  const portrait = hasPortrait ? walker.readU8() : null
  const hasSecondarySkills = walker.readBool()
  let secondarySkills: { skillId: number; level: number }[] = []
  if (hasSecondarySkills) {
    const count = walker.readU32()
    if (count > 64) throw new Error(`Implausible hero secondary skill count ${count}`)
    secondarySkills = Array.from({ length: count }, () => ({ skillId: walker.readU8(), level: walker.readU8() }))
  }
  const hasGarrison = walker.readBool()
  const garrisonStacks = hasGarrison ? walker.readCreatureSet(h3mVersion) : []
  const formation = walker.readU8()
  const artifactSet = walker.readHeroArtifactSet(h3mVersion)
  if (artifactSet.backpackArtifactCount > 128) throw new Error(`Implausible hero backpack artifact count ${artifactSet.backpackArtifactCount}`)
  const patrolRadius = walker.readU8()
  const result: Record<string, unknown> = {
    payloadKind: 'hero_or_prison', identifier, owner, heroType, hasName, name, experience, hasPortrait, portrait,
    secondarySkills, hasGarrison, garrisonStacks, formation, ...artifactSet, patrolRadius,
  }
  if (h3mVersion < H3M_VERSION_AB) {
    walker.skip(16)
    return { ...result, hasCustomBiography: false, biography: null, genderRaw: -1, spell: null }
  }
  if (h3mVersion < H3M_VERSION_SOD) {
    return { ...result, ...skipHeroAbPostPatrol(walker) }
  }
  const hasCustomBiography = walker.readBool()
  const biography = hasCustomBiography ? walker.readString(4096) : null
  const genderRaw = walker.readI8()
  const hasCustomSpells = walker.readBool()
  const customSpells = hasCustomSpells ? walker.readBitmaskHex(SPELLS_BYTES) : null
  const hasCustomPrimary = walker.readBool()
  const customPrimarySkills = hasCustomPrimary ? Array.from({ length: 4 }, () => walker.readU8()) : null
  walker.skip(16)
  let hota: Record<string, unknown> | undefined
  if (h3mVersion === H3M_VERSION_HOTA) {
    hota = { alwaysAddSkills: walker.readBool(), cannotGainExperience: walker.readBool(), level: walker.readI32() }
  }
  return { ...result, hasCustomBiography, biography, genderRaw, hasCustomSpells, customSpells, hasCustomPrimary, customPrimarySkills, hota }
}

function skipHero(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  return skipHeroCommon(walker, record, record.h3mVersion >= H3M_VERSION_AB, record.h3mVersion >= H3M_VERSION_SOD)
}

function readTownEventTail(walker: H3mWalker, h3mVersion: number): Record<string, unknown> {
  let hota: Record<string, unknown> | undefined
  if (h3mVersion === H3M_VERSION_HOTA) {
    hota = {
      creatureGrowth8: walker.readI32(), amount: walker.readI32(), specialBuildingsMaskA: walker.readI32(),
      specialBuildingsMaskB: walker.readI16(), neutralAffected: walker.readBool(),
    }
  }
  const eventBuildingsMask = walker.readBitmaskHex(BUILDINGS_BYTES)
  const creatureGrowth = Array.from({ length: 7 }, () => walker.readU16())
  const unknownTail = walker.readU32()
  return { eventBuildingsMask, creatureGrowth, unknownTail, hota }
}

function readTownPayload(
  walker: H3mWalker, record: H3mObjectRecord, payloadKind: string,
  hasIdentifier: boolean, hasObligatorySpells: boolean, hasAlignment: boolean,
): Record<string, unknown> {
  const identifier = hasIdentifier ? walker.readU32() : null
  const owner = walker.readU8()
  const hasName = walker.readBool()
  const name = hasName ? walker.readString(256) : null
  const hasGarrison = walker.readBool()
  const garrisonStacks = hasGarrison ? walker.readCreatureSet(record.h3mVersion) : []
  const formation = walker.readU8()
  const hasCustomBuildings = walker.readBool()
  let builtBuildingsMask: string | null = null
  let forbiddenBuildingsMask: string | null = null
  let hasFort: boolean | null = null
  if (hasCustomBuildings) {
    builtBuildingsMask = walker.readBitmaskHex(BUILDINGS_BYTES)
    forbiddenBuildingsMask = walker.readBitmaskHex(BUILDINGS_BYTES)
  } else {
    hasFort = walker.readBool()
  }
  const obligatorySpells = hasObligatorySpells ? walker.readBitmaskHex(SPELLS_BYTES) : null
  const availableSpells = walker.readBitmaskHex(SPELLS_BYTES)
  let specialBuildings: number[] = []
  if (record.h3mVersion === H3M_VERSION_HOTA) {
    walker.readBool() // spellResearchAllowed
    const specialBuildingsCount = walker.readU32()
    if (specialBuildingsCount > 64) throw new Error(`Implausible HotA special-building count ${specialBuildingsCount}`)
    specialBuildings = Array.from({ length: specialBuildingsCount }, () => walker.readU8())
  }
  const eventsCount = walker.readU32()
  if (eventsCount > 256) throw new Error(`Implausible town event count ${eventsCount}`)
  const events = Array.from({ length: eventsCount }, () => ({ ...walker.skipEventCommon(record.h3mVersion), ...readTownEventTail(walker, record.h3mVersion) }))
  const alignment = hasAlignment ? walker.readU8() : null
  const tailZero = walker.readBytes(3)
  if (tailZero[0] !== 0 || tailZero[1] !== 0 || tailZero[2] !== 0) throw new Error('Nonzero town tail bytes')
  return {
    payloadKind, identifier, owner, hasName, name, hasGarrison, garrisonStacks, formation, hasCustomBuildings,
    builtBuildingsMask, forbiddenBuildingsMask, hasFort, obligatorySpells, availableSpells, specialBuildings, events, alignment,
  }
}

function skipTown(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const v = record.h3mVersion
  return readTownPayload(walker, record, 'town', v >= H3M_VERSION_AB, v >= H3M_VERSION_AB, v >= H3M_VERSION_SOD)
}

function skipRandomTown(walker: H3mWalker, record: H3mObjectRecord): Record<string, unknown> {
  const v = record.h3mVersion
  return readTownPayload(walker, record, 'random_town', v >= H3M_VERSION_AB, v >= H3M_VERSION_AB, v >= H3M_VERSION_SOD)
}

function resolvePayloadSkipper(objectId: number, record: H3mObjectRecord): Skipper | null {
  if (objectId === h3obj.OBJECT_BORDER_GATE) return skipBorderGate
  if (objectId === h3obj.OBJECT_MINE || objectId === h3obj.OBJECT_ABANDONED_MINE) return skipMineFamily
  if (objectId === h3obj.OBJECT_GRAIL) return skipGrail
  if (h3obj.REWARD_WITH_GARBAGE_OBJECT_IDS.has(objectId)) return skipHotaRewardWithGarbage
  if (h3obj.REWARD_WITH_ARTIFACT_OBJECT_IDS.has(objectId)) return skipHotaRewardWithArtifact
  if (objectId === h3obj.OBJECT_CAMPFIRE || objectId === h3obj.OBJECT_LEAN_TO || objectId === h3obj.OBJECT_WAGON) return skipHotaResourceReward
  if (h3obj.CREATURE_BANK_OBJECT_IDS.has(objectId)) return skipHotaCreatureBank
  if (objectId === h3obj.OBJECT_PYRAMID) return (w, r) => skipHotaFixedExtension(w, r, 8, 'hota_pyramid_reward')
  if (objectId === h3obj.OBJECT_BLACK_MARKET) return (w, r) => skipHotaFixedExtension(w, r, 28, 'hota_black_market')
  if (objectId === h3obj.OBJECT_UNIVERSITY) return (w, r) => skipHotaFixedExtension(w, r, 8, 'hota_university')
  if (objectId === h3obj.OBJECT_HOTA_CUSTOM_1) {
    const subtype = record.templateSubtype || 0
    const byteCount = subtype === 0 || subtype === 1 ? 18 : 8
    return (w, r) => skipHotaFixedExtension(w, r, byteCount, 'hota_custom_reward_1')
  }
  if (objectId === h3obj.OBJECT_HOTA_CUSTOM_2 && (record.templateSubtype || 0) === 0) return (w, r) => skipHotaFixedExtension(w, r, 8, 'hota_seafaring_academy')
  if (objectId === h3obj.OBJECT_HOTA_CUSTOM_3 && (record.templateSubtype || 0) === 12) return (w, r) => skipHotaFixedExtension(w, r, 16, 'hota_trapper_lodge')
  return SKIPPERS[objectId] ?? null
}

const SKIPPERS: Record<number, Skipper> = {
  [h3obj.OBJECT_EVENT]: skipEvent,
  [h3obj.OBJECT_OCEAN_BOTTLE]: skipSign,
  [h3obj.OBJECT_SIGN]: skipSign,
  [h3obj.OBJECT_RESOURCE]: skipResource,
  [h3obj.OBJECT_RANDOM_RESOURCE]: skipResource,
  [h3obj.OBJECT_TOWN]: skipTown,
  [h3obj.OBJECT_RANDOM_TOWN]: skipRandomTown,
  [h3obj.OBJECT_LIGHTHOUSE]: (w) => skipOwnerU32(w, 'lighthouse'),
  [h3obj.OBJECT_SHIPYARD]: (w) => skipOwnerU32(w, 'shipyard'),
  [h3obj.OBJECT_SCHOLAR]: skipScholar,
  [h3obj.OBJECT_WITCH_HUT]: skipWitchHut,
  [h3obj.OBJECT_PANDORAS_BOX]: skipPandora,
  [h3obj.OBJECT_SPELL_SCROLL]: skipSpellScroll,
  [h3obj.OBJECT_SEER_HUT]: skipSeerHut,
  [h3obj.OBJECT_QUEST_GUARD]: skipQuestGuard,
  [h3obj.OBJECT_HERO_PLACEHOLDER]: skipHeroPlaceholder,
}
for (const id of h3obj.MONSTER_OBJECT_IDS) SKIPPERS[id] = skipMonster
for (const id of h3obj.HERO_OBJECT_IDS) SKIPPERS[id] = skipHero
for (const id of h3obj.FIXED_CREATURE_GENERATOR_IDS) SKIPPERS[id] = skipCreatureGenerator
for (const id of h3obj.ARTIFACT_OBJECT_IDS) SKIPPERS[id] = skipArtifact
for (const id of h3obj.SHRINE_OBJECT_IDS) SKIPPERS[id] = skipShrine
for (const id of h3obj.GARRISON_OBJECT_IDS) SKIPPERS[id] = skipGarrison
for (const id of h3obj.RANDOM_DWELLING_IDS) SKIPPERS[id] = skipRandomDwelling

function parseObjectHeader(
  walker: H3mWalker, size: number, layers: number, templates: h3obj.H3mTemplate[], index: number, h3mVersion: number,
): H3mObjectRecord {
  const offset = walker.tell()
  const x = walker.readU8(), y = walker.readU8(), z = walker.readU8()
  const templateIndex = walker.readU32()
  const zero = walker.readBytes(5)
  if (!(x <= size + 8 && y <= size + 8 && z < layers)) {
    throw new Error(`Record ${index} header position out of range at ${offset}: ${x},${y},${z}`)
  }
  if (templateIndex >= templates.length) {
    throw new Error(`Record ${index} template index ${templateIndex} outside ${templates.length} at ${offset}`)
  }
  for (const b of zero) if (b !== 0) throw new Error(`Record ${index} nonzero fixed header padding at ${offset + 7}`)
  const template = templates[templateIndex]
  return {
    index, recordOffset: offset, x, y, z, layer: z, key: `${z}:${x}:${y}`,
    templateIndex, templateAnimation: template.animation, templateBlockMask: template.blockMask,
    templateVisitMask: template.visitMask, templateObjectId: template.objectId, templateSubtype: template.subtype,
    h3mVersion,
  }
}

export interface WalkedObjects {
  declaredCount: number
  decodedCount: number
  walkEndOffset: number
  records: H3mObjectRecord[]
}

/** Walk the entire object instance table, starting at `objectTableOffset`
 *  (which already points past its own u32 count — matches
 *  `summarizeH3mShape`'s `objectTableOffset`). Fail-closed: throws on the
 *  first record with neither a decoder nor a no-payload allowlist entry. */
export function walkH3mObjects(
  data: Uint8Array, objectTableOffset: number, declaredCount: number, h3mVersion: number,
  size: number, layers: number, templates: h3obj.H3mTemplate[],
): WalkedObjects {
  const walker = new H3mWalker(data)
  walker.seek(objectTableOffset)
  const declared = walker.readU32()
  if (declared !== declaredCount) throw new Error(`Object count mismatch ${declared} != ${declaredCount}`)

  const records: H3mObjectRecord[] = []
  for (let index = 0; index < declared; index++) {
    const start = walker.tell()
    const record = parseObjectHeader(walker, size, layers, templates, index, h3mVersion)
    const objectId = record.templateObjectId
    let skipper = resolvePayloadSkipper(objectId, record)
    if (skipper === null) {
      if (!h3obj.isNoPayloadObject(objectId)) {
        throw new UnsupportedObjectPayloadError(
          'unsupported_object_id',
          `Record ${index} object id ${objectId} has no payload decoder or no-payload allowlist entry at offset ${start}`,
        )
      }
      skipper = skipGeneric
    }
    const payload = skipper(walker, record)
    Object.assign(record, payload)
    record.recordEndOffset = walker.tell()
    record.recordBytes = walker.tell() - start
    records.push(record)
  }
  return { declaredCount: declared, decodedCount: records.length, walkEndOffset: walker.tell(), records }
}
