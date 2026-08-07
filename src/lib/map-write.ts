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
 * Set (or insert) the custom display name for one map object, identified by
 * its `(type, id)` pair from propEntities — the same pair used to cross-
 * reference `objects[]`. If multiple entries already exist for that pair
 * (observed in one real sample map — the game itself does not dedupe this
 * table), only the first is updated; the rest are left as-is.
 */
export function upsertPropsName(chunk: Uint8Array, entityType: number, entityId: number, nameTitle: string): Uint8Array {
  const text = new TextDecoder('utf-8').decode(chunk)
  const { arrayOpen, arrayClose, span } = findJsonArraySpan(text, 'propsName')

  const entries = JSON.parse(span) as PropsNameEntry[]
  const existing = entries.find((e) => String(e.type) === String(entityType) && e.id === entityId)
  if (existing) {
    existing.nameTitle = nameTitle
  } else {
    entries.push({ type: entityType, id: entityId, nameTitle, tagTitle: '', description: '' })
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

// ─── Byte equality (verification) ───────────────────────────────────────────

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
