// ─── Top-level H3M file parser ───────────────────────────────────────────────
// Composes h3m-format.ts (header) + h3m-object-registry.ts (templates) +
// h3m-terrain.ts (tiles) + h3m-object-walk.ts (object instances) +
// h3m-global-events.ts into one fully-parsed representation of a `.h3m` file
// — mirrors the reference project's `walk_h3m_file()` shape. Ported from
// leviritchie/homm3-olden-stock-translator, used with the author's explicit
// permission.
//
// Deliberately NOT supported: campaign-embedded (.h3c) maps — only
// standalone `.h3m` files. A campaign-embedded file's extra "briefing tail"
// object records fail closed with a clear error rather than being silently
// misparsed (see h3m-object-walk.ts's doc comment).

import { BinaryReader } from './binary-reader'
import { decodeH3mScenarioHeader, type H3mScenarioHeader, SUPPORTED_H3M_SIZES } from './h3m-format'
import { parseH3mTemplate, type H3mTemplate } from './h3m-object-registry'
import { decodeH3mLayerTiles, type H3mTile } from './h3m-terrain'
import { walkH3mObjects, type H3mObjectRecord } from './h3m-object-walk'
import { readGlobalTimedEvents, type H3mGlobalTimedEvent } from './h3m-global-events'

export interface H3mShapeSummary {
  version: number
  size: number
  layers: number
  title: string
  description: string
  difficulty: number
  terrainStart: number
  terrainBytes: number
  templateTableOffset: number
  objectTableOffset: number
  templateCount: number
  objectCount: number
  templates: H3mTemplate[]
}

/** Try every candidate offset for where terrain data begins and require
 *  EXACTLY ONE to parse cleanly (template table + first object header) —
 *  the reference project's own hard-won lesson: the classic header's
 *  optional/variable-length fields make a hand-computed offset unreliable,
 *  even in a from-scratch, carefully-version-gated reader. */
function locateH3mTerrainAndObjects(
  data: Uint8Array, size: number, layers: number,
): { terrainStart: number; objectTableOffset: number; objectCount: number; templates: H3mTemplate[] } {
  const terrainBytes = size * size * layers * 7
  const candidates: { terrainStart: number; objectTableOffset: number; objectCount: number; templates: H3mTemplate[] }[] = []
  const maxScan = Math.min(data.length - terrainBytes - 8, 0x8000)

  for (let terrainStart = 0x20; terrainStart < maxScan; terrainStart++) {
    const templateOffset = terrainStart + terrainBytes
    try {
      const reader = new BinaryReader(data)
      reader.seek(templateOffset)
      const templateCount = reader.readU32()
      if (!(templateCount >= 1 && templateCount <= 4000)) continue
      const templates: H3mTemplate[] = []
      for (let i = 0; i < templateCount; i++) templates.push(parseH3mTemplate(reader))
      const objectTableOffset = reader.offset
      const objectCount = reader.readU32()
      if (!(objectCount >= 1 && objectCount <= 100000)) continue
      const x = reader.readU8(), y = reader.readU8(), z = reader.readU8()
      const defIndex = reader.readU32()
      if (x > size + 8 || y > size + 8 || z >= layers || defIndex >= templateCount) continue
      candidates.push({ terrainStart, objectTableOffset, objectCount, templates })
    } catch {
      continue
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`Expected one H3M terrain/template alignment, found ${candidates.length}`)
  }
  return candidates[0]
}

export function summarizeH3mShape(data: Uint8Array): H3mShapeSummary {
  const reader = new BinaryReader(data)
  const version = reader.readU32()
  reader.seek(0)
  // decodeH3mScenarioHeader already validates the version and reads the
  // HotA extension; reuse its prefix logic by re-deriving just what's
  // needed here (size/layers/title/description/difficulty) via a second,
  // independent pass — cheap, and keeps this function's contract narrow.
  const header = decodeH3mScenarioHeaderPrefix(data)
  const { terrainStart, objectTableOffset, objectCount, templates } = locateH3mTerrainAndObjects(data, header.size, header.layers)
  const terrainBytes = header.size * header.size * header.layers * 7
  return {
    version, size: header.size, layers: header.layers, title: header.title, description: header.description,
    difficulty: header.difficulty, terrainStart, terrainBytes, templateTableOffset: terrainStart + terrainBytes,
    objectTableOffset, templateCount: templates.length, objectCount, templates,
  }
}

/** Just the header prefix `summarizeH3mShape` needs (through `difficulty`) —
 *  shares no state with the full `decodeH3mScenarioHeader` read below;
 *  both start over from offset 0, exactly like the reference project's own
 *  two independent passes. */
function decodeH3mScenarioHeaderPrefix(data: Uint8Array): { size: number; layers: number; title: string; description: string; difficulty: number } {
  const reader = new BinaryReader(data)
  const version = reader.readU32()
  // Re-run the HotA extension read purely to advance the cursor correctly;
  // its own validation already happened (or will happen) in
  // decodeH3mScenarioHeader — duplicating it here is deliberate, not lossy.
  if (version === 32) {
    const formatLevel = reader.readU32()
    if (formatLevel !== 9) throw new Error(`Unsupported HotA format level ${formatLevel}`)
    reader.readU32(); reader.readU32(); reader.readU32() // release
    reader.readBool(); reader.readBool() // mirror/arena
    reader.readU32(); reader.readU32() // terrain/town type counts
    reader.readU8() // allowed difficulties mask
    reader.readBool(); reader.readBool() // canHireDefeatedHeroes / forceMatchingVersion
    reader.readU32() // unknown
  }
  reader.readBool() // anyPlayers
  const size = reader.readU32()
  if (!SUPPORTED_H3M_SIZES.has(size)) throw new Error(`Unsupported H3M map size ${size}`)
  const hasUnderground = reader.readBool()
  const title = reader.readString(256)
  const description = reader.readString(4096)
  const difficulty = reader.readU8()
  return { size, layers: hasUnderground ? 2 : 1, title, description, difficulty }
}

export interface ParsedH3M {
  header: H3mScenarioHeader
  shape: H3mShapeSummary
  /** Terrain tiles per layer, index 0 = surface, index 1 = underground (if any). */
  layers: H3mTile[][]
  records: H3mObjectRecord[]
  globalTimedEvents: H3mGlobalTimedEvent[]
}

/** Accepts either a raw or gzip-wrapped `.h3m` buffer (magic `1F 8B`). */
export function gunzipH3mIfNeeded(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

/** Parse an already-decompressed `.h3m` buffer into a fully-parsed shape. */
export function parseH3mFile(data: Uint8Array): ParsedH3M {
  const header = decodeH3mScenarioHeader(data)
  const shape = summarizeH3mShape(data)

  const layers: H3mTile[][] = []
  for (let layer = 0; layer < shape.layers; layer++) {
    const layerStart = shape.terrainStart + layer * shape.size * shape.size * 7
    layers.push(decodeH3mLayerTiles(data, layerStart, shape.size))
  }

  const walked = walkH3mObjects(data, shape.objectTableOffset, shape.objectCount, shape.version, shape.size, shape.layers, shape.templates)
  const globalTimedEvents = readGlobalTimedEvents(data, walked.walkEndOffset, shape.version)

  return { header, shape, layers, records: walked.records, globalTimedEvents }
}
