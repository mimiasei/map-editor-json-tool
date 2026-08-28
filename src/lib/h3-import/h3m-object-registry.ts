// ─── H3 object-class-id registry + template ("def") table parsing ───────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_object_registry.py` (id constants, no-payload allowlist) and
// `h3m_format.py`'s `parse_h3m_template`, used with the author's explicit
// permission.

import { BinaryReader } from './binary-reader'

export const OBJECT_ARTIFACT = 5
export const OBJECT_PANDORAS_BOX = 6
export const OBJECT_BLACK_MARKET = 7
export const OBJECT_CREATURE_BANK = 16
export const OBJECT_CREATURE_GENERATOR_1 = 17
export const OBJECT_CREATURE_GENERATOR_2 = 18
export const OBJECT_CREATURE_GENERATOR_3 = 19
export const OBJECT_CREATURE_GENERATOR_4 = 20
export const OBJECT_EVENT = 26
export const OBJECT_GARRISON = 33
export const OBJECT_HERO = 34
export const OBJECT_GRAIL = 36
export const OBJECT_LIGHTHOUSE = 42
export const OBJECT_TWO_WAY_MONOLITH = 45
export const OBJECT_MINE = 53
export const OBJECT_MONSTER = 54
export const OBJECT_OCEAN_BOTTLE = 59
export const OBJECT_CORPSE = 22
export const OBJECT_PRISON = 62
export const OBJECT_PYRAMID = 63
export const OBJECT_RANDOM_ARTIFACT = 65
export const OBJECT_RANDOM_ARTIFACT_TREASURE = 66
export const OBJECT_RANDOM_ARTIFACT_MINOR = 67
export const OBJECT_RANDOM_ARTIFACT_MAJOR = 68
export const OBJECT_RANDOM_ARTIFACT_RELIC = 69
export const OBJECT_RANDOM_HERO = 70
export const OBJECT_RANDOM_RESOURCE = 76
export const OBJECT_RANDOM_TOWN = 77
export const OBJECT_RESOURCE = 79
export const OBJECT_SCHOLAR = 81
export const OBJECT_SEA_CHEST = 82
export const OBJECT_SEER_HUT = 83
export const OBJECT_CRYPT = 84
export const OBJECT_SHIPWRECK = 85
export const OBJECT_SHIPWRECK_SURVIVOR = 86
export const OBJECT_SHIPYARD = 87
export const OBJECT_SHRINE_INCANTATION = 88
export const OBJECT_SHRINE_GESTURE = 89
export const OBJECT_SHRINE_THOUGHT = 90
export const OBJECT_SIGN = 91
export const OBJECT_SPELL_SCROLL = 93
export const OBJECT_TOWN = 98
export const OBJECT_TREASURE_CHEST = 101
export const OBJECT_TREE_OF_KNOWLEDGE = 102
export const OBJECT_SUBTERRANEAN_GATE = 103
export const OBJECT_UNIVERSITY = 104
export const OBJECT_WAGON = 105
export const OBJECT_WARRIORS_TOMB = 108
export const OBJECT_WHIRLPOOL = 111
export const OBJECT_WITCH_HUT = 113
export const OBJECT_VOLCANO = 158
export const OBJECT_BORDER_GATE = 212
export const OBJECT_HERO_PLACEHOLDER = 214
export const OBJECT_QUEST_GUARD = 215
export const OBJECT_RANDOM_DWELLING = 216
export const OBJECT_RANDOM_DWELLING_LVL = 217
export const OBJECT_RANDOM_DWELLING_FACTION = 218
export const OBJECT_GARRISON2 = 219
export const OBJECT_ABANDONED_MINE = 220
export const OBJECT_CAMPFIRE = 12
export const OBJECT_LEAN_TO = 39
export const OBJECT_FLOTSAM = 29
export const OBJECT_HOTA_CUSTOM_1 = 145
export const OBJECT_HOTA_CUSTOM_2 = 146
export const OBJECT_HOTA_CUSTOM_3 = 144
export const OBJECT_DESERT_HILLS = 206
export const OBJECT_UNKNOWN_SCENERY_207 = 207

export const ARTIFACT_OBJECT_IDS = new Set([
  OBJECT_ARTIFACT, OBJECT_RANDOM_ARTIFACT, OBJECT_RANDOM_ARTIFACT_TREASURE,
  OBJECT_RANDOM_ARTIFACT_MINOR, OBJECT_RANDOM_ARTIFACT_MAJOR, OBJECT_RANDOM_ARTIFACT_RELIC,
])
export const MONSTER_OBJECT_IDS = new Set([OBJECT_MONSTER, 71, 72, 73, 74, 75, 162, 163, 164])
export const HERO_OBJECT_IDS = new Set([OBJECT_HERO, OBJECT_PRISON, OBJECT_RANDOM_HERO])
export const FIXED_CREATURE_GENERATOR_IDS = new Set([
  OBJECT_CREATURE_GENERATOR_1, OBJECT_CREATURE_GENERATOR_2, OBJECT_CREATURE_GENERATOR_3, OBJECT_CREATURE_GENERATOR_4,
])
export const RANDOM_DWELLING_IDS = new Set([OBJECT_RANDOM_DWELLING, OBJECT_RANDOM_DWELLING_LVL, OBJECT_RANDOM_DWELLING_FACTION])
export const GARRISON_OBJECT_IDS = new Set([OBJECT_GARRISON, OBJECT_GARRISON2])
export const SHRINE_OBJECT_IDS = new Set([OBJECT_SHRINE_INCANTATION, OBJECT_SHRINE_GESTURE, OBJECT_SHRINE_THOUGHT])
export const CREATURE_BANK_OBJECT_IDS = new Set([OBJECT_CREATURE_BANK, 24, 25, OBJECT_CRYPT, OBJECT_SHIPWRECK])
export const REWARD_WITH_ARTIFACT_OBJECT_IDS = new Set([
  OBJECT_TREASURE_CHEST, OBJECT_CORPSE, OBJECT_WARRIORS_TOMB, OBJECT_SHIPWRECK_SURVIVOR, OBJECT_SEA_CHEST,
])
export const REWARD_WITH_GARBAGE_OBJECT_IDS = new Set([OBJECT_FLOTSAM, OBJECT_TREE_OF_KNOWLEDGE])
export const HOTA_REWARD_OBJECT_IDS = new Set([
  OBJECT_CAMPFIRE, OBJECT_LEAN_TO, OBJECT_WAGON, OBJECT_BLACK_MARKET, OBJECT_UNIVERSITY, OBJECT_PYRAMID,
  OBJECT_HOTA_CUSTOM_1, OBJECT_HOTA_CUSTOM_2, OBJECT_HOTA_CUSTOM_3,
])

export const CREATURE_GENERATOR_FAMILY_BY_ID: Record<number, string> = {
  [OBJECT_CREATURE_GENERATOR_1]: 'creature_generator_1',
  [OBJECT_CREATURE_GENERATOR_2]: 'creature_generator_2',
  [OBJECT_CREATURE_GENERATOR_3]: 'creature_generator_3',
  [OBJECT_CREATURE_GENERATOR_4]: 'creature_generator_4',
}
export const RANDOM_DWELLING_FAMILY_BY_ID: Record<number, string> = {
  [OBJECT_RANDOM_DWELLING]: 'random_dwelling',
  [OBJECT_RANDOM_DWELLING_LVL]: 'random_dwelling_level',
  [OBJECT_RANDOM_DWELLING_FACTION]: 'random_dwelling_faction',
}

/** Positive classic-H3M allowlist (RoE/AB/SoD) for object ids known to carry
 *  ZERO per-instance payload bytes — the difference between "genuinely no
 *  payload" and "not implemented yet" (which must fail closed instead). */
export const VCMI_CLASSIC_STATIC_NO_PAYLOAD_OBJECT_IDS = new Set([
  0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 35, 37, 38, 39, 40,
  41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 55, 56, 57, 58, 60, 61, 63, 64, 78, 80, 82, 84, 85, 86, 92, 94, 95, 96,
  97, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117, 118, 119, 120, 121,
  122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144,
  145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 165, 166, 167, 168, 169, 170,
  171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193,
  194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 213, 221, 222, 223, 224,
  225, 226, 227, 228, 229, 230, 231,
])

// A few of these ids are also HotA-only reward objects whose payload is only
// present on HotA-versioned maps (see h3m-object-walk.ts's HOTA-gated
// decoders) — real per-instance bytes exist there, so they must be routed to
// a decoder rather than treated as always-zero-payload. Mirrors upstream's
// PAYLOAD_ROUTED_OBJECT_IDS subtraction rather than removing them from the
// allowlist above (the allowlist stays the exact VCMI RoE/AB/SoD source of
// truth; routing is a separate, version-aware decision in h3m-object-walk.ts).
export function isNoPayloadObject(objectId: number): boolean {
  return VCMI_CLASSIC_STATIC_NO_PAYLOAD_OBJECT_IDS.has(objectId)
}

export function creatureGeneratorFamily(objectId: number): string {
  const family = CREATURE_GENERATOR_FAMILY_BY_ID[objectId]
  if (!family) throw new Error(`Object id ${objectId} is not a fixed creature generator`)
  return family
}

export function randomDwellingFamily(objectId: number): string {
  const family = RANDOM_DWELLING_FAMILY_BY_ID[objectId]
  if (!family) throw new Error(`Object id ${objectId} is not a random dwelling`)
  return family
}

export interface H3mTemplate {
  animation: string
  blockMask: number[]
  visitMask: number[]
  terrainMask: number
  objectId: number
  subtype: number
  templateType: number
  printPriority: number
}

/** One "def" template — parsed once per unique object graphic, referenced by
 *  index from every placed instance. Block/visit masks are 6 bytes each (8x6
 *  bit grid); a CLEAR bit means blocked/occupied, anchored at the
 *  bottom-right cell (7,5) — easy to get backwards. */
export function parseH3mTemplate(reader: BinaryReader): H3mTemplate {
  const animation = reader.readString(256)
  if (!animation.toLowerCase().endsWith('.def')) {
    throw new Error(`Object template without .def animation at offset ${reader.offset}: ${animation}`)
  }
  const blockMask = Array.from(reader.readBytes(6))
  const visitMask = Array.from(reader.readBytes(6))
  reader.skip(2)
  const terrainMask = reader.readU16()
  const objectId = reader.readU32()
  const subtype = reader.readU32()
  const templateType = reader.readU8()
  const printPriority = reader.readU8()
  reader.skip(16)
  return { animation, blockMask, visitMask, terrainMask, objectId, subtype, templateType, printPriority }
}

/** Decode an 8x6 block mask into occupied `{dx, dz}` offsets from the
 *  object's own placement anchor (its bottom-right cell). */
export function blockMaskOffsets(blockMask: number[]): { dx: number; dz: number }[] {
  const offsets: { dx: number; dz: number }[] = []
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      if (((blockMask[row] >> col) & 1) === 0) {
        offsets.push({ dx: col - 7, dz: row - 5 })
      }
    }
  }
  return offsets
}
