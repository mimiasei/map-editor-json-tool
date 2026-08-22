// ─── .map binary writer — surgical byte-level container round-trip ──────────
// Independent of the lossy parseMapFile() path (map-parser.ts): that parser
// decodes hash/version/separator only to skip them, and JSON.parses each
// chunk, discarding the exact bytes. Neither is safe to build a writer on —
// a full JSON.parse → JSON.stringify round-trip is not guaranteed byte-stable
// (float formatting, key order, escaping), and if a re-saved map is rejected
// by the game we need to know that's from an intentional edit, not from
// reformatting noise. So this module re-reads the container from scratch and
// only ever touches the bytes it's explicitly asked to change — with one
// deliberate, narrower exception: upsertPropsName() below JSON.parses just
// that one small array (never the whole chunk) because inserting a brand-new
// entry isn't expressible as a substring splice. See its doc comment.
//
// See issue #120 for the investigation this is based on: the file is a single
// gzip stream; decompressed layout is
//   [1B hashLen][hash][1B verLen][version][2B separator][varint len + JSON] × N
// A 32-hex-char digest sits in the header and is duplicated as Block 1's
// `hashSum` — always identical to each other, algorithm unknown (brute-forced
// md5/sha1/sha256/sha512 over every plausible block combination with no
// match). This module preserves both copies verbatim rather than
// recomputing anything.
//
// Block count is NOT always 4 — one sample map ships with 3. Read until EOF.

export interface MapContainer {
  /** Header hash bytes, without the length-prefix byte. */
  hash: Uint8Array
  /** Header version bytes, without the length-prefix byte. */
  version: Uint8Array
  /** The 2-byte separator that follows the version string. */
  separator: Uint8Array
  /** Each block's raw JSON bytes, in file order. Length varies (often 4, sometimes fewer). */
  chunks: Uint8Array[]
}

// ─── LEB128 (unsigned varint, protobuf-style) — mirrors map-parser.ts ───────
// Duplicated rather than imported: map-parser.ts's reader is a private
// implementation detail of a function that returns parsed JSON, not raw
// bytes, and this module intentionally never calls into that path.

function readVarint(buf: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0
  let shift = 0
  let pos = offset
  while (true) {
    if (pos >= buf.length) throw new Error(`Varint overrun at offset ${pos}`)
    const byte = buf[pos++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
    if (shift > 35) throw new Error('Varint too long')
  }
  return { value: result >>> 0, next: pos }
}

function writeVarint(value: number): Uint8Array {
  const bytes: number[] = []
  let v = value >>> 0
  while (true) {
    const byte = v & 0x7f
    v >>>= 7
    if (v !== 0) {
      bytes.push(byte | 0x80)
    } else {
      bytes.push(byte)
      break
    }
  }
  return new Uint8Array(bytes)
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// ─── Container read/write ────────────────────────────────────────────────────

/** Parse an already-decompressed .map buffer into its verbatim header + chunk bytes. */
export function readMapContainer(data: Uint8Array): MapContainer {
  let pos = 0

  const hashLen = data[pos++]
  const hash = data.slice(pos, pos + hashLen)
  pos += hashLen

  const verLen = data[pos++]
  const version = data.slice(pos, pos + verLen)
  pos += verLen

  const separator = data.slice(pos, pos + 2)
  pos += 2

  const chunks: Uint8Array[] = []
  while (pos < data.length) {
    const { value: byteLen, next } = readVarint(data, pos)
    pos = next
    chunks.push(data.slice(pos, pos + byteLen))
    pos += byteLen
  }

  return { hash, version, separator, chunks }
}

/** Re-frame a container back into the decompressed .map byte layout. */
export function buildMapContainer(container: MapContainer): Uint8Array {
  const parts: Uint8Array[] = [
    new Uint8Array([container.hash.length]),
    container.hash,
    new Uint8Array([container.version.length]),
    container.version,
    container.separator,
  ]
  for (const chunk of container.chunks) {
    parts.push(writeVarint(chunk.length), chunk)
  }
  return concatBytes(parts)
}

// ─── gzip ────────────────────────────────────────────────────────────────────
// pipeThrough (not the naive writer/reader form) — same reasoning as the
// DecompressionStream usage in map-parser.ts: awaiting a writer.write before
// starting to read deadlocks once the stream exceeds its internal buffer.

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

// ─── JSON array span lookup ──────────────────────────────────────────────────
// Shared by every objectsProperties.<key> editor below. Locates `"<key>":[`
// and walks bracket depth to find the matching close — the same technique for
// every table, since entries are flat objects with no nested arrays/objects
// of their own (verified against every real propsName/propEntities entry).

function findJsonArraySpan(text: string, key: string): { arrayOpen: number; arrayClose: number; span: string } {
  const marker = `"${key}":[`
  const markerIdx = text.indexOf(marker)
  if (markerIdx === -1) throw new Error(`"${key}" array not found in this block`)

  const arrayOpen = markerIdx + marker.length - 1 // index of the "["
  let depth = 0
  let arrayClose = -1
  for (let i = arrayOpen; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) { arrayClose = i; break }
    }
  }
  if (arrayClose === -1) throw new Error(`"${key}" array is not properly closed`)

  return { arrayOpen, arrayClose, span: text.slice(arrayOpen, arrayClose + 1) }
}

// ─── Entity SID rename ───────────────────────────────────────────────────────

/**
 * Rename a `propEntities[].sid` value inside a decompressed Block 2 chunk, by
 * exact byte substring match scoped to the `propEntities` array span — never
 * touching an identically-spelled string anywhere else in the block (e.g. an
 * object-type SID or a hero SID). Requires the old SID to appear exactly once
 * inside that span; throws on 0 or >1 matches rather than guess.
 */
export function renameEntitySid(chunk: Uint8Array, oldSid: string, newSid: string): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propEntities')

  const oldNeedle = `"sid":${JSON.stringify(oldSid)}`
  const occurrences = span.split(oldNeedle).length - 1
  if (occurrences === 0) throw new Error(`SID "${oldSid}" not found in propEntities`)
  if (occurrences > 1) {
    throw new Error(`SID "${oldSid}" appears ${occurrences} times in propEntities — refusing an ambiguous rename`)
  }

  const patchedSpan = span.replace(oldNeedle, `"sid":${JSON.stringify(newSid)}`)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Custom display name (objectsProperties.propsName) ──────────────────────
// Unlike propEntities' single sid string, an entry here has 3 optional text
// fields (nameTitle/tagTitle/description) and, per real sample maps, may not
// exist for a given (type, id) at all yet — this can both update an existing
// entry and insert a brand-new one. That needs real JSON manipulation, not a
// substring splice, so — deliberately narrower than "never JSON.stringify"
// elsewhere in this module — this parses and re-serializes *only* the
// propsName array itself (typically a handful of entries), leaving every
// other byte in the block untouched. Verified byte-identical for untouched
// entries against both real sample maps that have non-empty propsName data,
// including one with Cyrillic text and literal duplicate entries.
//
// New entries write tagTitle/description as "" rather than omitting the keys
// — the doc's own notes describe those fields as "(empty in sample)", i.e.
// present-but-blank, not absent, in every observed empty case. Unverified
// whether the game truly requires them; flagged for the in-game test.
interface PropsNameEntry {
  type?: number | string
  id?: number
  nameTitle?: string
  tagTitle?: string
  description?: string
}

/**
 * Set (or insert) the custom display name and/or description for one map
 * object, identified by its `(type, id)` pair from propEntities — the same
 * pair used to cross-reference `objects[]`. If multiple entries already
 * exist for that pair (observed in one real sample map — the game itself
 * does not dedupe this table), only the first is updated; the rest are left
 * as-is. A field omitted from `patch` is left untouched on an existing
 * entry (so a name-only save never clobbers an existing description, and
 * vice versa) — a brand-new entry defaults any omitted field to `""`.
 */
export function upsertPropsName(
  chunk: Uint8Array,
  entityType: number,
  entityId: number,
  patch: { nameTitle?: string; description?: string },
): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propsName')

  const entries = JSON.parse(span) as PropsNameEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (existing) {
    if (patch.nameTitle !== undefined) existing.nameTitle = patch.nameTitle
    if (patch.description !== undefined) existing.description = patch.description
  } else {
    entries.push({
      type: entityType,
      id: entityId,
      nameTitle: patch.nameTitle ?? '',
      tagTitle: '',
      description: patch.description ?? '',
    })
  }

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Assign a brand-new entity SID (objectsProperties.propEntities) ─────────
// renameEntitySid() above requires the SID to already exist — it's a rename,
// not an assignment. Issue #125's "No Combine Geometry" flow needs the other
// case: giving a SID to an object that has never had one (e.g. a decoration
// with no propEntities entry at all), which is an insert, not a substring
// replace — same upsert technique as upsertPropsName() below.
interface PropEntitiesEntry {
  type?: number | string
  id?: number
  sid?: string
}

/**
 * Set (or insert) the entity SID for a map object identified by its
 * `(type, id)` pair. Throws if `sid` already belongs to a *different*
 * `(type, id)` — callers are expected to have already checked uniqueness
 * against every known entity SID (same convention as RenameEntitySidDialog).
 */
export function upsertPropEntities(chunk: Uint8Array, entityType: number, entityId: number, sid: string): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propEntities')

  const entries = JSON.parse(span) as PropEntitiesEntry[]
  const conflict = entries.find((e) => e.sid === sid && !(String(e.type) === String(entityType) && e.id === entityId))
  if (conflict) throw new Error(`SID "${sid}" is already used by another entity`)

  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (existing) {
    existing.sid = sid
  } else {
    entries.push({ type: entityType, id: entityId, sid })
  }

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── "No Combine Geometry" (objectsProperties.propNoCombineGeometries) ──────
// Same upsert technique as upsertPropsName() — confirmed present (as an
// empty array when unused) in every one of the 12 real sample maps, so this
// never hits the "table doesn't exist at all" case findJsonArraySpan would throw on.
interface PropNoCombineGeometryEntry {
  type?: number | string
  id?: number
  isNoCombineGeometry?: boolean
}

/**
 * Set (or insert) the "No Combine Geometry" flag for a map object. Per the
 * official editor's guide, enabling this is what allows an otherwise-non-
 * interactable decoration to carry a working entity SID (issue #125 item 4).
 */
export function setNoCombineGeometry(chunk: Uint8Array, entityType: number, entityId: number, value: boolean): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propNoCombineGeometries')

  const entries = JSON.parse(span) as PropNoCombineGeometryEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (existing) {
    existing.isNoCombineGeometry = value
  } else {
    entries.push({ type: entityType, id: entityId, isNoCombineGeometry: value })
  }

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Portal linkage (objectsProperties.propPortals) ─────────────────────────
// Same upsert technique as setNoCombineGeometry — confirmed present (as an
// empty array when unused) in every one of the 12 real sample maps. Only
// ever touches the ONE portal instance being edited, same "surgical, no
// cascading" philosophy as renameEntitySid: setting portal A's target to B
// does not also set B's target to A — a true two-way link needs both
// portals edited (issue #127's UI says so explicitly, rather than silently
// half-doing it).
interface PropPortalEntry {
  type?: number | string
  id?: number
  targetIdx?: number
  isActive?: boolean
}

/**
 * Set (or insert) a portal's target and/or active state. Fields omitted from
 * `patch` are left as-is on an existing entry; a brand-new entry defaults to
 * `targetIdx: -1` (unlinked) / `isActive: true` for whichever field isn't given.
 */
export function upsertPropPortals(
  chunk: Uint8Array,
  entityType: number,
  entityId: number,
  patch: { targetIdx?: number; isActive?: boolean },
): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propPortals')

  const entries = JSON.parse(span) as PropPortalEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (existing) {
    if (patch.targetIdx !== undefined) existing.targetIdx = patch.targetIdx
    if (patch.isActive !== undefined) existing.isActive = patch.isActive
  } else {
    entries.push({
      type: entityType,
      id: entityId,
      targetIdx: patch.targetIdx ?? -1,
      isActive: patch.isActive ?? true,
    })
  }

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Spawner "Player type" (Block 1 spawns.spawns[] + Block 2 propSpawns) ───
// The one edit in this module that spans two chunks: this data is duplicated
// in Block 1 (spawns.spawns[], one entry per spawner, matched by `owner`) and
// Block 2 (objectsProperties.propSpawns[], matched by (type,id) like every
// other table here, also carrying `owner`) — verified byte-identical between
// the two across all 12 real sample maps (issue #125). Patching only one
// would leave them disagreeing, so both are rewritten together. Block 1's
// top-level `spawns` key holds an OBJECT ({playersCount, spawns:[...],
// takenHeroes}), not the array itself — findJsonArraySpan's `"spawns":[`
// marker still lands correctly on the nested array because the outer key
// serializes as `"spawns":{`, never `"spawns":[` (verified: exactly one
// occurrence of the literal `"spawns":[` substring in every real Block 1).
//
// Deliberately NOT implemented: reassigning `owner` itself (a different
// spawner "Player attached to this spawner" field) — Unfrozen's own guide
// flags that one specifically as "EXTREMELY bug-prone," so this editor only
// ever changes spawnType (Player/Bot/Unknown) for the owner a spawner
// already has.
interface PropSpawnEntry {
  type?: number | string
  id?: number
  owner?: number
  spawnType?: number
  spawnPointType?: number
  isLocked?: boolean
}

interface Block1SpawnEntry {
  owner?: number
  spawnType?: number
  [key: string]: unknown
}

/**
 * Set the "Player type" (0=Player, 1=Bot, 2=Unknown) for the spawner
 * identified by `(entityType, entityId)`, patching both Block 1's
 * spawns.spawns[] and Block 2's propSpawns[] entries for that spawner's
 * `owner`. Throws if either representation can't be found — a partial patch
 * would be worse than refusing outright.
 */
export function setSpawnerPlayerType(
  block1Chunk: Uint8Array,
  block2Chunk: Uint8Array,
  entityType: number,
  entityId: number,
  spawnType: 0 | 1 | 2,
): { block1Chunk: Uint8Array; block2Chunk: Uint8Array } {
  const text2 = new TextDecoder('utf-8').decode(block2Chunk)
  const span2 = findJsonArraySpan(text2, 'propSpawns')
  const propSpawns = JSON.parse(span2.span) as PropSpawnEntry[]
  const entry2 = propSpawns.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (!entry2 || entry2.owner === undefined) {
    throw new Error(`No propSpawns entry found for (type=${entityType}, id=${entityId})`)
  }
  const owner = entry2.owner
  entry2.spawnType = spawnType
  const patchedText2 = text2.slice(0, span2.arrayOpen) + JSON.stringify(propSpawns) + text2.slice(span2.arrayClose + 1)

  const text1 = new TextDecoder('utf-8').decode(block1Chunk)
  const span1 = findJsonArraySpan(text1, 'spawns')
  const block1Spawns = JSON.parse(span1.span) as Block1SpawnEntry[]
  const entry1 = block1Spawns.find((e) => e.owner === owner)
  if (!entry1) {
    throw new Error(`No Block 1 spawns[] entry found for owner ${owner}`)
  }
  entry1.spawnType = spawnType
  const patchedText1 = text1.slice(0, span1.arrayOpen) + JSON.stringify(block1Spawns) + text1.slice(span1.arrayClose + 1)

  return {
    block1Chunk: new TextEncoder().encode(patchedText1),
    block2Chunk: new TextEncoder().encode(patchedText2),
  }
}

// ─── City name (objectsProperties.propCities.customCityName) ───────────────
// A separate field from propsName, confirmed two ways: a real Unfrozen
// sample map (Gorges_of_Discord.map) has "undead_city_name_12" here — a real
// SID, not literal text — while propsName's nameTitle for that same object
// is unset entirely; and directly from an Unfrozen developer, who confirmed
// the game reads THIS field for a city's displayed name, resolved as a
// localization SID lookup exactly like propsName — nameTitle has no effect
// on a city's actual in-game name at all. A real map (Stormlight.map) was
// found with literal text ("Kholinar") written directly here — the same
// "LOC:<text>" failure mode issue #125 item 6 already fixed for propsName,
// just on a different table nobody had connected the display-name feature
// to yet (issue #132).
interface PropCitiesNameEntry {
  type?: number | string
  id?: number
  customCityName?: string
}

/**
 * Set a city spawner's display-name SID. Requires an existing propCities
 * entry for (entityType, entityId) — a real city spawner always has one
 * (it's how this editor knows it's a city at all, via the faction/spawner
 * enrichment in map-extract.ts); refuses to fabricate a new entry that would
 * be missing every other required field (faction, buildings, etc.).
 */
export function setCustomCityName(chunk: Uint8Array, entityType: number, entityId: number, customCityName: string): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propCities')

  const entries = JSON.parse(span) as PropCitiesNameEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (!existing) {
    throw new Error(`No propCities entry found for (type=${entityType}, id=${entityId}) — this object isn't a configured city spawner`)
  }
  existing.customCityName = customCityName

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Hero assignment (objectsProperties.propHeroes.heroSid) ─────────────────
// A real shipped map (Fun_and_Graves.map) proves this table is also the join
// point for a fully custom hero: its propHeroes entry for id 0 points
// heroSid at "cm_fun_hero_1", which resolves to a hero definition file at
// Core/DB/heroes/custom_maps/cm_fun_hero_1.json rather than one of the
// per-faction roster folders — same table, same field, just a different
// folder the game also checks (issue #139). Repointing this is therefore
// all that's needed to swap which hero definition a spawner uses; the
// definition file itself is a separate, editor-only concern (see
// src/types/hero.ts and zip-export.ts, which ship it into the export ZIP).
interface PropHeroEntry {
  type?: number | string
  id?: number
  isDefined?: boolean
  heroSid?: string
}

/**
 * Set a hero spawner's heroSid. Requires an existing propHeroes entry for
 * (entityType, entityId) — same "refuse to fabricate a new entry" reasoning
 * as setCustomCityName: a real hero spawner always has one already (it's how
 * this editor knows the object is a hero spawner at all).
 */
export function upsertPropHero(chunk: Uint8Array, entityType: number, entityId: number, heroSid: string): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propHeroes')

  const entries = JSON.parse(span) as PropHeroEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (!existing) {
    throw new Error(`No propHeroes entry found for (type=${entityType}, id=${entityId}) — this object isn't a configured hero spawner`)
  }
  existing.heroSid = heroSid
  existing.isDefined = true

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Guard squad (objectsProperties.propSquads) ──────────────────────────────
// A fixed (non-random) creature squad guarding an interactable object,
// confirmed on custom_* objects across multiple real maps (e.g.
// custom_black_tower: unitProps [{sid:"black_dragon_upg",count:1},
// {sid:"black_dragon",count:1}]) — see plans/testItems-props-reference.md
// (issue #143). Never confirmed on a mine in any of the 217 real mine
// instances checked across every shipped map — nothing in the schema
// restricts it by object type, so writing one is plausible by construction,
// but treat that combination as unverified against the actual game.
//
// Unlike propCities/propHeroes, most guardable objects have NO existing
// propSquads row at all (it's only present when a map author assigned a
// guard) — so this finds-or-inserts, defaulting the fields every real
// example shares, same convention as setNoCombineGeometry/upsertPropPortals.
interface PropSquadUnitProp {
  sid?: string
  count?: number
}

interface PropSquadEntry {
  type?: number | string
  id?: number
  isMainGuard?: boolean
  isStartBattleImmediately?: boolean
  reactionType?: number
  weeklyIncrementBonus?: number
  unitProps?: PropSquadUnitProp[]
}

export function upsertPropSquads(
  chunk: Uint8Array,
  entityType: number,
  entityId: number,
  unitProps: { sid: string; count: number }[],
): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propSquads')

  const entries = JSON.parse(span) as PropSquadEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (existing) {
    existing.unitProps = unitProps
  } else {
    entries.push({
      type: entityType,
      id: entityId,
      isMainGuard: false,
      isStartBattleImmediately: false,
      reactionType: 2,
      weeklyIncrementBonus: 0,
      unitProps,
    })
  }

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── City/portal garrison (objectsProperties.propRandomSquads.sids) ─────────
// A city or portal's starting garrison, keyed to its own (type, id) —
// confirmed against 4 real shipped maps (e.g. Thirst_for_Power.map's
// random-city id 5881: sids ["squad_m5_mega_guard_3"]). Each string in
// `sids` references a pre-built SQUAD TEMPLATE file
// (Core/DB/squads/**/*.json), not a raw creature sid — see
// src/lib/catalog/builder.ts's collectSquadTemplates() (issue #143).
//
// A city/portal object always has a propRandomSquads placeholder already
// (confirmed structurally even when unconfigured, sids:[]) — same
// "refuse to fabricate" reasoning as setCustomCityName/upsertPropHero.
interface PropRandomSquadEntry {
  type?: number | string
  id?: number
  sids?: string[]
}

export function upsertPropRandomSquads(chunk: Uint8Array, entityType: number, entityId: number, sids: string[]): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propRandomSquads')

  const entries = JSON.parse(span) as PropRandomSquadEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (!existing) {
    throw new Error(`No propRandomSquads entry found for (type=${entityType}, id=${entityId}) — this object isn't a configured city/portal`)
  }
  existing.sids = sids

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Reward slots (objectsProperties.propRewardParams.parameters) ──────────
// Each slot is "-" (unfilled), "resourceSid:amount", or a bare artifact/
// skill sid — see src/lib/map-grid/reward-params.ts for the shared encode/
// decode rules (issue #143, building on the read-only display added in
// issue #138). Slot COUNT is fixed per object (e.g. custom_windmill always
// has exactly 1, custom_prismatic_lair always exactly 3) — this replaces
// the whole array in one write rather than editing a single index, since
// the editor stages every slot locally before saving. Only objects the read
// layer already shows a Rewards section for have this table at all, so —
// same as propRandomSquads — refuses to fabricate a new entry.
interface PropRewardParamsEntry {
  type?: number | string
  id?: number
  parameters?: string[]
}

export function upsertPropRewardParams(chunk: Uint8Array, entityType: number, entityId: number, parameters: string[]): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propRewardParams')

  const entries = JSON.parse(span) as PropRewardParamsEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (!existing) {
    throw new Error(`No propRewardParams entry found for (type=${entityType}, id=${entityId}) — this object has no reward slots`)
  }
  existing.parameters = parameters

  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Move a placed instance (objects[] / squads[] / markers[]) ──────────────
// Issue #167 Phase A. Unlike every editor above (which patches a row inside
// one of the 29 objectsProperties.* sub-tables), this patches the placement
// arrays themselves — objects[]/squads[] are grouped-by-sid parallel arrays
// (`{sid, ids:[], nodes:[], rotations?:[], levels?:[]}`, confirmed against
// real sample maps during #167's feasibility investigation); markers[] is a
// flat array of `{node, sid, id, v}`. Position is stored only as `node` (a
// row-major tile index) — there's no separate x/z in the file, so a move is
// always exactly one `nodes[i]`/`.node` scalar overwrite, never a shape
// change, hence the same "parse just this one array, not the whole block"
// technique as upsertPropsName rather than a substring splice (a bare numeric
// node value can't be substring-matched unambiguously — many entries can
// share the same number).
interface ObjectGroupEntry {
  sid?: string
  ids?: number[]
  nodes?: number[]
  rotations?: number[]
  levels?: number[]
}

interface MarkerEntry {
  node?: number
  sid?: string
  id?: number
  v?: string
}

/**
 * Move the placed instance identified by `(entityType, entityId)` to
 * `newNode`. `entityType` 0/2 look inside `objects`/`squads` (grouped-by-sid
 * parallel arrays — finds the group whose `ids[]` contains `entityId`,
 * overwrites the same-index `nodes[]` entry); `entityType` 1 looks inside the
 * flat `markers` array and overwrites `.node` directly. Throws if the
 * instance can't be found — a partial/silent no-op would be worse.
 */
export function moveObjectInstance(chunk: Uint8Array, entityType: 0 | 1 | 2, entityId: number, newNode: number): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const key = entityType === 0 ? 'objects' : entityType === 2 ? 'squads' : 'markers'
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, key)

  if (entityType === 1) {
    const entries = JSON.parse(span) as MarkerEntry[]
    const existing = entries.find((e) => e.id === entityId)
    if (!existing) throw new Error(`No markers[] entry found for id ${entityId}`)
    existing.node = newNode
    const patchedSpan = JSON.stringify(entries)
    const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
    return new TextEncoder().encode(patchedText)
  }

  const groups = JSON.parse(span) as ObjectGroupEntry[]
  for (const group of groups) {
    const idx = group.ids?.indexOf(entityId) ?? -1
    if (idx === -1) continue
    if (!group.nodes) throw new Error(`Group for sid "${group.sid}" has no nodes[] array`)
    group.nodes[idx] = newNode
    const patchedSpan = JSON.stringify(groups)
    const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
    return new TextEncoder().encode(patchedText)
  }
  throw new Error(`No ${key} entry found for id ${entityId}`)
}

// ─── Rotate a placed instance (objects[] only) ─────────────────────────────
// `rotations[]` is a 0-3 quadrant enum (0/90/180/270°) with a `+10` offset
// for a mirrored variant (10-13) — confirmed against every real sample map's
// `rotations[]` values (only {0,1,2,3,10,11,12,13} ever occur) and against
// the mapmaking guide's documented SpawnMapObject rotation enum. Only
// `objects[]` (type 0) ever carries this field — squads[]/markers[] never
// do (confirmed structurally and in map-extract.ts's push() call sites).

/** Step `currentRotation` by `delta` (±1), staying within whichever "half"
 *  (plain 0-3 or mirrored 10-13) it's currently in. */
export function stepRotation(currentRotation: number, delta: 1 | -1): number {
  const mirrored = currentRotation >= 10
  const quadrant = ((currentRotation % 10) + delta + 4) % 4
  return quadrant + (mirrored ? 10 : 0)
}

/**
 * Set the placed `objects[]` instance identified by `entityId`'s rotation to
 * `newRotation` directly (same "find the group by id, mutate one parallel
 * array's value at the matching index" shape as `moveObjectInstance`).
 * Throws if the instance, or its `rotations[]` array, isn't found — a
 * partial/silent no-op would be worse.
 */
export function rotateObjectInstance(chunk: Uint8Array, entityId: number, newRotation: number): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'objects')

  const groups = JSON.parse(span) as ObjectGroupEntry[]
  for (const group of groups) {
    const idx = group.ids?.indexOf(entityId) ?? -1
    if (idx === -1) continue
    if (!group.rotations) throw new Error(`Group for sid "${group.sid}" has no rotations[] array`)
    group.rotations[idx] = newRotation
    const patchedSpan = JSON.stringify(groups)
    const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
    return new TextEncoder().encode(patchedText)
  }
  throw new Error(`No objects[] entry found for id ${entityId}`)
}

// ─── Add a new placed instance (objects[] / squads[] / markers[]) ──────────
// Issue #167 Phase B. `objectsFreeId`/`squadsFreeId`/`markersFreeId` are
// monotonic high-water-mark counters (confirmed during #167's feasibility
// investigation: never reused after a deletion, so the correct id to hand
// out is always the counter's CURRENT value, verbatim — never recomputed as
// "lowest free id" from what's currently placed). Reading/patching one is a
// bare top-level numeric scalar, not an array — findJsonArraySpan doesn't
// apply, hence the small sibling helper below.

function findTopLevelScalarSpan(text: string, key: string): { valueStart: number; valueEnd: number; value: number } {
  const marker = `"${key}":`
  const markerIdx = text.indexOf(marker)
  if (markerIdx === -1) throw new Error(`"${key}" not found in this block`)
  const valueStart = markerIdx + marker.length
  let valueEnd = valueStart
  while (valueEnd < text.length && text[valueEnd] >= '0' && text[valueEnd] <= '9') valueEnd++
  if (valueEnd === valueStart) throw new Error(`"${key}" is not a bare numeric scalar`)
  return { valueStart, valueEnd, value: Number(text.slice(valueStart, valueEnd)) }
}

/** Patch a bare top-level numeric scalar (e.g. one of the *FreeId counters) —
 *  a sibling to findJsonArraySpan, but for a single value rather than an array. */
export function patchTopLevelScalar(chunk: Uint8Array, key: string, newValue: number): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { valueStart, valueEnd } = findTopLevelScalarSpan(text, key)
  const patchedText = text.slice(0, valueStart) + String(newValue) + text.slice(valueEnd)
  return new TextEncoder().encode(patchedText)
}

/**
 * Add a new `objects[]` (type 0) or `squads[]` (type 2) instance at `node`.
 * Finds the sid's existing group and pushes onto its parallel arrays, or
 * creates a brand-new group if this sid has no placements yet.
 *
 * A brand-new group always seeds `rotations`/`levels` with a default
 * (`[rotation ?? 0]`/`[level ?? 0]`) rather than omitting the key — every
 * real placed object on every sample map carries both, even single-instance
 * groups. Confirmed the hard way: a TSE-added object that omitted these
 * (the old behavior here) loaded fine in this app and in the game's own Map
 * Editor, but crashed the actual game at launch with a NullReferenceException
 * constructing its Minimap — diffing that map against the same file re-saved
 * once through the game's own editor showed the editor backfilling exactly
 * `rotations:[0]`/`levels:[0]` plus one default row each in
 * `objectsProperties.propVariants`/`propRewardParams` (entityType 0 only;
 * never observed for squads) — see `backfillNewObjectPropertiesDefaults`.
 *
 * `block1Chunk` is only actually touched for `city-spawner`/`hero-spawner`
 * (real player-start points, not free-standing decorations — see
 * `backfillPlayerStartSpawner`); every other sid returns it unchanged. Takes
 * and returns both chunks unconditionally anyway, matching
 * `deleteObjectInstance`'s existing dual-chunk convention, rather than a
 * signature that special-cases by sid.
 *
 * Returns the allocated id alongside the patched chunks so the caller can
 * immediately reference the new instance (e.g. to select it).
 */
export function addObjectInstance(
  block1Chunk: Uint8Array,
  block2Chunk: Uint8Array,
  entityType: 0 | 2,
  sid: string,
  node: number,
  rotation?: number,
  level?: number,
): { block1Chunk: Uint8Array; block2Chunk: Uint8Array; newId: number } {
  const key = entityType === 0 ? 'objects' : 'squads'
  const freeIdKey = entityType === 0 ? 'objectsFreeId' : 'squadsFreeId'

  const text2 = new TextDecoder('utf-8').decode(block2Chunk)
  const newId = findTopLevelScalarSpan(text2, freeIdKey).value

  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text2, key)
  const groups = JSON.parse(span) as ObjectGroupEntry[]
  const existing = groups.find((g) => g.sid === sid)
  if (existing) {
    existing.ids = [...(existing.ids ?? []), newId]
    existing.nodes = [...(existing.nodes ?? []), node]
    if (existing.rotations) existing.rotations = [...existing.rotations, rotation ?? 0]
    if (existing.levels) existing.levels = [...existing.levels, level ?? 0]
  } else {
    groups.push({ sid, ids: [newId], nodes: [node], rotations: [rotation ?? 0], levels: [level ?? 0] })
  }
  const patchedSpan = JSON.stringify(groups)
  let patchedText2 = text2.slice(0, arrayOpen) + patchedSpan + text2.slice(arrayClose + 1)
  let patchedBlock1Chunk = block1Chunk

  if (entityType === 0) {
    patchedText2 = backfillNewObjectPropertiesDefaults(patchedText2, newId, sid)
    const playerStartDefault = PLAYER_START_SPAWNER_DEFAULTS[sid]
    if (playerStartDefault) {
      const result = backfillPlayerStartSpawner(patchedBlock1Chunk, patchedText2, newId, playerStartDefault)
      patchedBlock1Chunk = result.block1Chunk
      patchedText2 = result.block2Text
    }
  }
  const finalBlock2Chunk = patchTopLevelScalar(new TextEncoder().encode(patchedText2), freeIdKey, newId + 1)
  return { block1Chunk: patchedBlock1Chunk, block2Chunk: finalBlock2Chunk, newId }
}

/** One of the "randomized spawn placeholder" sids' own `objectsProperties.*`
 *  row default, keyed on the field the game actually uses to decide what
 *  spawns there — confirmed missing entirely on a TSE-added `random-squad`
 *  (it ended up with no `propRandomSquads` row at all, so the game and its
 *  own Map Editor couldn't recognize it as a configured spawner — reported
 *  as "ends up as an empty object"). `random-res` genuinely has no such
 *  table (confirmed against two real, unedited placements — its
 *  propVariants/propRewardParams rows below are sufficient on their own),
 *  so it's deliberately absent from this map.
 *
 *  Default field values are sourced from real, shipped maps' own
 *  author-configured instances — NOT from a "freshly placed, never edited"
 *  sample, a mistake this file made once already: an early version of
 *  random-squad's default copied `requestedValue: 0` from exactly such a
 *  freshly-placed-but-never-actually-played sample, and it turned out that
 *  value makes the in-game squad generator produce nothing to spawn, which
 *  the engine treats as a fatal "WorldObject not found" for the whole
 *  object rather than a harmless empty guard — worse than the original
 *  missing-row bug, since the object no longer renders at all. Every real
 *  SHIPPED map's random-squad instead uses a solidly nonzero value; see the
 *  inline comment on that default for specifics. */
const RANDOM_SPAWNER_TABLE_DEFAULTS: Record<string, { table: string; row: (id: number) => Record<string, unknown> }> = {
  'random-squad': {
    table: 'propRandomSquads',
    row: (id) => ({
      // Bumping requestedValue from 0 to 5000 alone (a prior fix) turned
      // out to be an incomplete repeat of the same mistake: `tier: 2` was
      // never updated alongside it, and mixing fields from two DIFFERENT
      // real samples — Glittering_Strait.map's requestedValue:5000 with
      // Stormlight_squad.map's untested tier:2 — produced a mismatched
      // combination. Confirmed via a real player.log: the engine derives a
      // nonzero "rollable value" from requestedValue (progress over the
      // old 0), but still fails with "Can't roll any config squad with
      // value: 3750" — i.e. no squad template matches that value at tier
      // 2. Glittering_Strait.map's own instance pairs requestedValue:5000
      // with tier:1, not 2 — using its FULL tuple verbatim this time,
      // not fields cherry-picked across unrelated samples.
      type: 0, id, sids: [], requestedValue: 5000, fraction: '', tier: 1, isMainGuard: false,
      reactionType: 2, customTopUnit: '', weeklyIncrementBonus: 0, diplomacyUnitsCountBonus: 0,
      isEscape: true, isAutobatle: true, isFreeDiplomacy: false, isCampaignFreeDiplomacy: false,
      isCampaignDiplomacy: false, isIgnoreMultiply: false, obstruction: '', customStacks: 0,
    }),
  },
  'random-item': {
    table: 'propRandomItems',
    row: (id) => ({ type: 0, id, rarity: 0 }),
  },
  'random-hire': {
    table: 'propRandomHires',
    row: (id) => ({ type: 0, id, tier: 1, fraction: 0 }),
  },
}

/** Seed the `objectsProperties.*` rows the game's own Map Editor adds for a
 *  brand-new type-0 object (see `addObjectInstance`'s doc comment for how
 *  the base two were confirmed) plus, for the randomized-spawn placeholder
 *  sids, the one extra table that actually makes them function as a
 *  configured spawner rather than an inert placement (see
 *  `RANDOM_SPAWNER_TABLE_DEFAULTS`). Skips a table silently if it isn't
 *  present in this particular file rather than inventing one — same "only
 *  touch what's really there" caution `deleteObjectInstance`'s generic
 *  sweep already follows, just in the insert direction. */
function backfillNewObjectPropertiesDefaults(block2Text: string, newId: number, sid: string): string {
  let text = block2Text
  const tryAppendRow = (tableKey: string, row: Record<string, unknown>): void => {
    let found: { arrayOpen: number; arrayClose: number; span: string }
    try {
      found = findJsonArraySpan(text, tableKey)
    } catch {
      return
    }
    const entries = JSON.parse(found.span) as Array<{ type?: number | string; id?: number }>
    if (entries.some((e) => String(e.type) === '0' && e.id === newId)) return
    entries.push(row)
    const patchedSpan = JSON.stringify(entries)
    text = text.slice(0, found.arrayOpen) + patchedSpan + text.slice(found.arrayClose + 1)
  }
  tryAppendRow('propVariants', { type: 0, id: newId, selectedVar: -1, typeVariant: 0, fraction: 0, unitVersion: 0 })
  tryAppendRow('propRewardParams', { type: 0, id: newId, parameters: [] })
  const randomSpawnerDefault = RANDOM_SPAWNER_TABLE_DEFAULTS[sid]
  if (randomSpawnerDefault) {
    tryAppendRow(randomSpawnerDefault.table, randomSpawnerDefault.row(newId))
  }
  return text
}

// ─── city-spawner / hero-spawner (real player-start points) ────────────────
// Unlike every other addable sid, these two are tied to an actual player
// slot, not a free-standing decoration: confirmed across every real sample
// map (15/15, zero exceptions) that Block 1's `spawns.spawns[]` has EXACTLY
// one entry per player (`owner` values are always the contiguous range
// 1..playersCount, no gaps, no duplicates), and Block 2's `propSpawns[]`
// duplicates the same `owner` per (type,id) — the same two-representations-
// of-one-fact relationship `setSpawnerPlayerType`'s own doc comment already
// describes. There is no `*FreeId`-style "next id" for the player slot
// itself: a new spawner can only take over a player slot that's currently
// UNCLAIMED (e.g. one whose old spawner was just deleted, which splices its
// Block 1 entry out entirely per deleteObjectInstance) — it never invents a
// slot beyond playersCount.
interface PlayerStartSpawnerDefault {
  /** 0 = city-spawner, 1 = hero-spawner — confirmed against every real
   *  propSpawns/Block1 spawn entry for each sid, zero exceptions. */
  spawnPointType: 0 | 1
  /** The extra objectsProperties table(s) this sid needs beyond the shared
   *  propSpawns row, each confirmed present on every real, unedited
   *  instance of this sid across every sample map. */
  extraTables: { table: string; row: (id: number) => Record<string, unknown> }[]
}

const PLAYER_START_SPAWNER_DEFAULTS: Record<string, PlayerStartSpawnerDefault> = {
  'city-spawner': {
    spawnPointType: 0,
    extraTables: [
      {
        table: 'propCities',
        row: (id) => ({
          type: 0, id, isDefined: false, factionSid: '', spawnHero: true,
          buildingsConstructionSid: 'default_buildings_construction',
          buildingsBanSid: 'default_buildings_ban',
          buildingsSettingsSid: 'default_buildings_settings', customCityName: '',
        }),
      },
      {
        // A city's starting-garrison config — same table random-squad uses,
        // but confirmed with a DIFFERENT default (tier 0, not 2) on every
        // one of 28 real city-spawner instances surveyed, zero exceptions.
        table: 'propRandomSquads',
        row: (id) => ({
          type: 0, id, sids: [], requestedValue: 0, fraction: '', tier: 0, isMainGuard: false,
          reactionType: 2, customTopUnit: '', weeklyIncrementBonus: 0, diplomacyUnitsCountBonus: 0,
          isEscape: true, isAutobatle: true, isFreeDiplomacy: false, isCampaignFreeDiplomacy: false,
          isCampaignDiplomacy: false, isIgnoreMultiply: false, obstruction: '', customStacks: 0,
        }),
      },
      {
        table: 'propGrowthUnits',
        row: (id) => ({ type: 0, id, isConstantGrowth: true, countGrowth: 1 }),
      },
    ],
  },
  'hero-spawner': {
    spawnPointType: 1,
    extraTables: [
      {
        // Every real hero-spawner ships with a hero already assigned
        // (isDefined:true) — no real "blank" instance exists to confirm
        // against directly, but the field SET itself (exactly these two
        // keys, on every real instance surveyed) is unambiguous; isDefined:
        // false/heroSid:'' mirrors propCities' own confirmed "not yet
        // chosen" convention above.
        table: 'propHeroes',
        row: (id) => ({ type: 0, id, isDefined: false, heroSid: '' }),
      },
    ],
  },
}

/**
 * Claim an unclaimed player slot for a brand-new city-spawner/hero-spawner:
 * finds the lowest `owner` in `1..playersCount` not already present in
 * Block 1's `spawns.spawns[]`, adds that slot's entry there, and adds the
 * matching `propSpawns` + sid-specific extra rows to Block 2. Throws if
 * every player slot is already claimed — a partial/silent no-op (or
 * inventing a slot beyond playersCount) would leave the map in a state the
 * game was never confirmed to tolerate.
 */
function backfillPlayerStartSpawner(
  block1Chunk: Uint8Array,
  block2Text: string,
  newId: number,
  config: PlayerStartSpawnerDefault,
): { block1Chunk: Uint8Array; block2Text: string } {
  const text1 = new TextDecoder('utf-8').decode(block1Chunk)
  const fullBlock1 = JSON.parse(text1) as { spawns?: { playersCount?: number } }
  const playersCount = fullBlock1.spawns?.playersCount ?? 0

  const span1 = findJsonArraySpan(text1, 'spawns')
  const block1Spawns = JSON.parse(span1.span) as Block1SpawnEntry[]
  const usedOwners = new Set(block1Spawns.map((e) => e.owner))
  let owner: number | undefined
  for (let candidate = 1; candidate <= playersCount; candidate++) {
    if (!usedOwners.has(candidate)) { owner = candidate; break }
  }
  if (owner === undefined) {
    throw new Error(
      `Every player slot (1-${playersCount}) already has a spawn point. Increase the map's player ` +
      'count first, or delete an existing city/hero spawner to free a slot.',
    )
  }

  block1Spawns.push({
    owner, spawnType: 0, playerId: '', spawnPointType: config.spawnPointType,
    isCityDefined: false, factionSid: '', isHeroDefined: false, heroSid: '',
    colorId: -1, isAlive: true, isLocked: false,
  })
  const patchedText1 = text1.slice(0, span1.arrayOpen) + JSON.stringify(block1Spawns) + text1.slice(span1.arrayClose + 1)

  let text2 = block2Text
  const tryAppendRow = (tableKey: string, row: Record<string, unknown>): void => {
    let found: { arrayOpen: number; arrayClose: number; span: string }
    try {
      found = findJsonArraySpan(text2, tableKey)
    } catch {
      return
    }
    const entries = JSON.parse(found.span) as unknown[]
    entries.push(row)
    text2 = text2.slice(0, found.arrayOpen) + JSON.stringify(entries) + text2.slice(found.arrayClose + 1)
  }
  tryAppendRow('propSpawns', { type: 0, id: newId, owner, spawnType: 0, spawnPointType: config.spawnPointType, isLocked: false })
  for (const { table, row } of config.extraTables) {
    tryAppendRow(table, row(newId))
  }

  return { block1Chunk: new TextEncoder().encode(patchedText1), block2Text: text2 }
}

/** Add a new flat `markers[]` (type 1, zone) instance at `node`. Simpler than
 *  objects/squads — no grouping, no rotation/level. */
export function addMarkerInstance(chunk: Uint8Array, sid: string, node: number): { chunk: Uint8Array; newId: number } {
  const text = new TextDecoder('utf-8').decode(chunk)
  const newId = findTopLevelScalarSpan(text, 'markersFreeId').value

  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'markers')
  const entries = JSON.parse(span) as MarkerEntry[]
  entries.push({ node, sid, id: newId, v: '' })
  const patchedSpan = JSON.stringify(entries)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  const finalChunk = patchTopLevelScalar(new TextEncoder().encode(patchedText), 'markersFreeId', newId + 1)
  return { chunk: finalChunk, newId }
}

// ─── Delete a placed instance (objects[] / squads[] / markers[]) ───────────
// Issue #167 Phase C. Splices the instance out of its objects[]/squads[]
// group's parallel arrays (or the flat markers[] array), sweeps every
// objectsProperties.* table for matching (type,id) rows and drops them
// (generic — iterates whatever keys the table actually has, not just the
// ones this codebase's types model, so this cleans up all ~29 real tables,
// not just the dozen explicitly typed in map-parser.ts), and auto-fixes the
// two cheap/safe cross-references a real delete can leave dangling: a linked
// portal partner's targetIdx, and the paired Block 1 spawns.spawns[] entry
// for a spawner. Everything else that could reference this instance (a
// trigger/condition/dialog param, keyObjects[], areas[].keyObjectId) is
// deliberately NOT auto-fixed — the UI is expected to warn the user via
// entity-usage.ts before calling this, not fix it silently, since this repo
// has no way to know whether the game tolerates a dangling reference there.
function findJsonObjectSpan(text: string, key: string): { objOpen: number; objClose: number; span: string } {
  const marker = `"${key}":{`
  const markerIdx = text.indexOf(marker)
  if (markerIdx === -1) throw new Error(`"${key}" object not found in this block`)
  const objOpen = markerIdx + marker.length - 1 // index of the "{"
  let depth = 0
  let objClose = -1
  for (let i = objOpen; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) { objClose = i; break }
    }
  }
  if (objClose === -1) throw new Error(`"${key}" object is not properly closed`)
  return { objOpen, objClose, span: text.slice(objOpen, objClose + 1) }
}

export function deleteObjectInstance(
  block1Chunk: Uint8Array,
  block2Chunk: Uint8Array,
  entityType: 0 | 1 | 2,
  entityId: number,
): { block1Chunk: Uint8Array; block2Chunk: Uint8Array } {
  let text2 = new TextDecoder('utf-8').decode(block2Chunk)

  // Read propPortals/propSpawns BEFORE the sweep below removes them — need
  // their values to know what (if anything) to auto-fix afterward.
  let linkedPortalId: number | undefined
  let spawnerOwner: number | undefined
  try {
    const { span } = findJsonArraySpan(text2, 'propPortals')
    const match = (JSON.parse(span) as PropPortalEntry[])
      .find((p) => String(p.type) === String(entityType) && p.id === entityId)
    if (match && match.targetIdx !== undefined && match.targetIdx !== -1) linkedPortalId = match.targetIdx
  } catch { /* no propPortals table in this block */ }
  try {
    const { span } = findJsonArraySpan(text2, 'propSpawns')
    const match = (JSON.parse(span) as PropSpawnEntry[])
      .find((p) => String(p.type) === String(entityType) && p.id === entityId)
    if (match?.owner !== undefined) spawnerOwner = match.owner
  } catch { /* no propSpawns table in this block */ }

  // 1. Remove the instance from objects[]/squads[]/markers[].
  const placementKey = entityType === 0 ? 'objects' : entityType === 2 ? 'squads' : 'markers'
  {
    const { arrayOpen, arrayClose, span } = findJsonArraySpan(text2, placementKey)
    let patchedSpan: string
    if (entityType === 1) {
      const entries = JSON.parse(span) as MarkerEntry[]
      const idx = entries.findIndex((e) => e.id === entityId)
      if (idx === -1) throw new Error(`No markers[] entry found for id ${entityId}`)
      entries.splice(idx, 1)
      patchedSpan = JSON.stringify(entries)
    } else {
      const groups = JSON.parse(span) as ObjectGroupEntry[]
      let found = false
      for (const group of groups) {
        const idx = group.ids?.indexOf(entityId) ?? -1
        if (idx === -1) continue
        group.ids!.splice(idx, 1)
        group.nodes?.splice(idx, 1)
        group.rotations?.splice(idx, 1)
        group.levels?.splice(idx, 1)
        found = true
        break
      }
      if (!found) throw new Error(`No ${placementKey} entry found for id ${entityId}`)
      patchedSpan = JSON.stringify(groups.filter((g) => (g.ids?.length ?? 0) > 0))
    }
    text2 = text2.slice(0, arrayOpen) + patchedSpan + text2.slice(arrayClose + 1)
  }

  // 2. Sweep every objectsProperties.* table for matching (type,id) rows.
  {
    const { objOpen, objClose, span } = findJsonObjectSpan(text2, 'objectsProperties')
    const props = JSON.parse(span) as Record<string, unknown>
    for (const tableKey of Object.keys(props)) {
      const table = props[tableKey]
      if (!Array.isArray(table)) continue
      props[tableKey] = table.filter((row) => {
        if (!row || typeof row !== 'object') return true
        const r = row as { type?: number | string; id?: number }
        return !(String(r.type) === String(entityType) && r.id === entityId)
      })
    }
    const patchedSpan = JSON.stringify(props)
    text2 = text2.slice(0, objOpen) + patchedSpan + text2.slice(objClose + 1)
  }

  // 3. Auto-fix: null out the linked portal partner's targetIdx (portals are
  // always type-0 objects, confirmed during #167's original investigation).
  if (linkedPortalId !== undefined) {
    text2 = new TextDecoder('utf-8').decode(
      upsertPropPortals(new TextEncoder().encode(text2), 0, linkedPortalId, { targetIdx: -1 }),
    )
  }

  // 4. Auto-fix: clear the paired Block 1 spawns.spawns[] entry for a spawner.
  let text1 = new TextDecoder('utf-8').decode(block1Chunk)
  if (spawnerOwner !== undefined) {
    const { arrayOpen, arrayClose, span } = findJsonArraySpan(text1, 'spawns')
    const block1Spawns = JSON.parse(span) as Block1SpawnEntry[]
    const idx = block1Spawns.findIndex((e) => e.owner === spawnerOwner)
    if (idx !== -1) {
      block1Spawns.splice(idx, 1)
      text1 = text1.slice(0, arrayOpen) + JSON.stringify(block1Spawns) + text1.slice(arrayClose + 1)
    }
  }

  return {
    block1Chunk: new TextEncoder().encode(text1),
    block2Chunk: new TextEncoder().encode(text2),
  }
}

/** A drag-painted batch of `objects[]` (type 0) placements — the terrain
 *  painter's technique (Phase D) generalized to any placeable object, not
 *  just tilesMap biomes. `deletions` are existing non-blocking decorative
 *  instances the paint stroke overwrote (the caller — MapGridDialog, which
 *  has the catalog footprint data — has already decided which ones qualify;
 *  this function just applies both halves as one atomic edit, by chaining
 *  the already-verified deleteObjectInstance/addObjectInstance one call at a
 *  time). Deletions run first so an overwritten tile's old instance never
 *  transiently coexists with its replacement. */
export function paintObjects(
  block1Chunk: Uint8Array,
  block2Chunk: Uint8Array,
  additions: { node: number; sid: string }[],
  deletions: number[],
): { block1Chunk: Uint8Array; block2Chunk: Uint8Array; newIds: number[] } {
  let b1 = block1Chunk
  let b2 = block2Chunk
  for (const id of deletions) {
    const result = deleteObjectInstance(b1, b2, 0, id)
    b1 = result.block1Chunk
    b2 = result.block2Chunk
  }
  const newIds: number[] = []
  for (const { node, sid } of additions) {
    const result = addObjectInstance(b1, b2, 0, sid, node)
    b1 = result.block1Chunk
    b2 = result.block2Chunk
    newIds.push(result.newId)
  }
  return { block1Chunk: b1, block2Chunk: b2, newIds }
}

// ─── Paint terrain (issue #167 Phase D) ─────────────────────────────────────
// `tilesMap` is a flat number[] (biome id 1-7), one entry per tile — the
// simplest possible case here: parse the span as number[], overwrite the
// touched indices, re-stringify. Never touches objects[]/squads[]/markers[]
// or any objectsProperties.* table (a different top-level array entirely),
// so by construction this can't overwrite or interact with a placed object.
// Takes a whole batch of changes in one call, not one call per tile — a
// paint/drag stroke across N tiles should produce one file write, not N.

/** Overwrite `tilesMap[node]` for every `{node, biomeId}` in `changes`. */
export function paintTerrainTiles(chunk: Uint8Array, changes: { node: number; biomeId: number }[]): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'tilesMap')
  const tiles = JSON.parse(span) as number[]
  for (const { node, biomeId } of changes) {
    if (node < 0 || node >= tiles.length) {
      throw new Error(`Node ${node} is out of bounds for tilesMap (length ${tiles.length})`)
    }
    tiles[node] = biomeId
  }
  const patchedSpan = JSON.stringify(tiles)
  const patchedText = text.slice(0, arrayOpen) + patchedSpan + text.slice(arrayClose + 1)
  return new TextEncoder().encode(patchedText)
}

// ─── Byte equality (verification) ───────────────────────────────────────────

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
