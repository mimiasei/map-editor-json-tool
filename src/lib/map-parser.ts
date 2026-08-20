// ─── .map binary parser ───────────────────────────────────────────────────────
// Format (after gzip decompression):
//   1 byte  hashLen  + hashLen bytes  (hash, skip)
//   1 byte  verLen   + verLen bytes   (version string, skip)
//   2 bytes 0x0D 0x00                 (skip)
//   Then 4 blocks, each prefixed by an LEB128 unsigned varint (byte length),
//   followed by that many bytes of UTF-8 JSON.
//
// Block 1: scenario/lobby metadata  { title, desc, spawns, sizeX, sizeZ, banInfoData, hashSum }
// Block 2: map data                 { mapName, objects[], squads[], markers[], objectsProperties, … }
// Block 3: dialog/quest shell       { dialogs: { lines: [] }, quests: { quests: [] } }
// Block 4: editable scripting layer { comment, aiRolesId, counters, interruptions, quests }

export interface RawMapBlock1 {
  title?: string
  desc?: string
  sizeX?: number
  sizeZ?: number
  /** Real shape is `{playersCount, spawns: [...], takenHeroes}`, one entry per
   *  spawner object on the map — NOT one per player slot. Duplicated in Block 2's
   *  objectsProperties.propSpawns (matched by `owner`), verified 1:1 identical
   *  across all 12 sample maps (issue #125): both must be patched together on write. */
  spawns?: {
    playersCount?: number
    spawns?: Array<{
      owner?: number
      /** "Player type" in the official editor: 0=Player (human), 1=Bot (AI), 2=Unknown (open slot, undocumented in real samples). */
      spawnType?: number
      playerId?: string
      /** "Spawner type": 0=City, 1=Hero. */
      spawnPointType?: number
      isCityDefined?: boolean
      factionSid?: string
      isHeroDefined?: boolean
      heroSid?: string
      colorId?: number
      isAlive?: boolean
      /** "Lock player type" in the official editor. */
      isLocked?: boolean
    }>
    takenHeroes?: unknown
  }
  banInfoData?: {
    bannedHeroes?: string[]
    bannedUnits?: string[]
    bannedMagics?: string[]
    bannedItems?: string[]
    bannedSkills?: string[]
  }
  hashSum?: string
}

export interface RawMapBlock2 {
  mapName?: string
  /** Terrain type ID per tile, one of DB/map/tiles/tiles.json's 7 biome rows
   *  (1=Grass..7=Dirt). Flat array, length sizeX_*sizeZ_, same row-major
   *  indexing as everything else keyed by `node` (issue #122 grid terrain fill). */
  tilesMap?: number[]
  /** Water material ID per tile (DB/map/waters/waters.json, 1-7), 0 = no water.
   *  Same flat indexing as tilesMap. */
  waterMap?: number[]
  /** Elevation tier per tile: -1 = lowered ("basin"), 0 = ground, 1 =
   *  heightened. Confirmed (blocked-tile-overlay research): water only ever
   *  sits on level -1 tiles, and a level-≠0 tile is only impassable at its
   *  boundary with a different level (see climbsMap) — not across its whole
   *  extent. Same flat indexing as tilesMap. */
  levelsMap?: number[]
  /** Slope/ramp marker, confirmed structurally (not the format-notes doc's
   *  original "presumably cliff-passability" guess): every real `1` tile
   *  sits on the LOWER side of a levelsMap height boundary, bordering the
   *  higher side — it's the walkable transition, not a blocker itself. Same
   *  flat indexing as tilesMap. */
  climbsMap?: number[]
  objects?: Array<{
    sid?: string | string[]
    ids?: number[]
    nodes?: unknown[]
    rotations?: number[]
    levels?: number[]
  }>
  /** Fixed/scripted squad placements — a SEPARATE id-namespace from `objects[]`
   *  (issue #122: ids collide across the two arrays, so any lookup keyed on
   *  `objects[]`'s id alone can silently resolve to the wrong instance). */
  squads?: Array<{
    sid?: string
    ids?: number[]
    nodes?: unknown[]
  }>
  /** Editor-only zone-shape annotations, not gameplay objects. A third,
   *  separate id-namespace (`type: 1` in objectsProperties). */
  markers?: Array<{
    node?: number
    id?: number
    sid?: string
    v?: string
  }>
  objectsProperties?: {
    propEntities?: Array<{ type?: string; id?: number; sid?: string }>
    /** Custom per-instance display name/tag/description set in the official map editor. */
    propsName?: Array<{ type?: string; id?: number; nameTitle?: string; tagTitle?: string; description?: string }>
    propHeroes?: Array<{ type?: string; id?: number; isDefined?: boolean; heroSid?: string }>
    /** City spawners. `spawnHero` is the "also spawn a hero" slot; `isDefined`
     *  refers to the city's faction, not the hero. */
    propCities?: Array<{
      type?: string
      id?: number
      isDefined?: boolean
      spawnHero?: boolean
      factionSid?: string
      customCityName?: string
    }>
    /** Fixed (non-random) squad composition. `type` distinguishes a guard
     *  squad co-located with a regular object (`0`) from an entry in the
     *  separate `squads[]` array (`2`) — both occur in real maps, so `id`
     *  alone is never enough to resolve which one this is (issue #122). */
    propSquads?: Array<{
      type?: string
      id?: number
      unitProps?: Array<{ sid?: string; count?: number }>
    }>
    /** "No Combine Geometry" checkbox in the official editor (issue #125) —
     *  lets a normally-non-interactable decoration carry an entity SID. */
    propNoCombineGeometries?: Array<{ type?: string; id?: number; isNoCombineGeometry?: boolean }>
    /** Per-instance duplicate of Block 1's `spawns.spawns[]` (matched by `owner`),
     *  keyed here by `(type, id)` like every other objectsProperties table
     *  (issue #125) — verified 1:1 identical with Block 1 across all 12 sample maps. */
    propSpawns?: Array<{
      type?: string
      id?: number
      owner?: number
      spawnType?: number
      spawnPointType?: number
      isLocked?: boolean
    }>
    /** Portal linkage (issue #127) — `id` is this portal instance's own id,
     *  `targetIdx` is the LINKED portal's instance id (-1 = unlinked), `isActive`
     *  gates whether this endpoint currently works (an inactive portal only
     *  receives — the official guide calls it an "exit portal"). Confirmed real
     *  shapes across sample maps: symmetric two-way pairs, asymmetric one-way
     *  pairs, and many-to-one hubs (several entrances sharing one exit). */
    propPortals?: Array<{
      type?: string
      id?: number
      targetIdx?: number
      isActive?: boolean
    }>
    /** Reward-slot configuration, found on "custom_*" objects and some
     *  others. Each string in `parameters` is "-" (unfilled slot),
     *  "resourceSid:amount" (e.g. "gold:3000"), or a bare artifact/skill sid
     *  — indistinguishable from each other without a catalog lookup, see
     *  src/lib/map-grid/reward-params.ts. Confirmed against real maps in
     *  plans/testItems-props-reference.md. */
    propRewardParams?: Array<{ type?: string; id?: number; parameters?: string[] }>
    /** A city/portal's starting garrison, keyed to its own (type, id) —
     *  `sids` references pre-built SQUAD TEMPLATE files
     *  (Core/DB/squads/**\/*.json), not raw creature sids (issue #143).
     *  Confirmed against 4 real shipped maps, e.g. Thirst_for_Power.map's
     *  random-city: `sids: ["squad_m5_mega_guard_3"]`. Also carries several
     *  other roll-config fields (requestedValue, fraction, tier, ...) this
     *  editor doesn't touch, left untouched on write. */
    propRandomSquads?: Array<{ type?: string; id?: number; sids?: string[] }>
    /** Generic per-instance active/inactive toggle — unrelated to
     *  propPortals' own isActive or propMarkers' isActivate below; a
     *  separate table, seen on plain objects (up to 208 uses in one map). */
    propActivations?: Array<{ type?: string; id?: number; isActive?: boolean }>
    /** Explicit player-index ownership override. -1 observed meaning
     *  neutral/unowned. */
    propOwners?: Array<{ type?: string; id?: number; owner?: number }>
    /** Trigger-zone (type===1 marker) state — the official editor's own
     *  "Activate" and "Delete after trigger" checkboxes. See the official
     *  guide: an inactive zone ("Activate" off) doesn't interrupt hero
     *  movement or fire its actions at all; "Delete after trigger" removes
     *  the zone automatically the first time it fires. */
    propMarkers?: Array<{ type?: string; id?: number; isActivate?: boolean; isDelete?: boolean }>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawMapBlock3 {
  dialogs?: { lines?: unknown[] }
  quests?: { quests?: unknown[] }
}

export interface RawMapBlock4 {
  comment?: string
  aiRolesId?: string
  counters?: unknown[]
  interruptions?: unknown[]
  quests?: unknown[]
}

export interface RawMapBlocks {
  block1: RawMapBlock1
  block2: RawMapBlock2
  block3: RawMapBlock3
  block4: RawMapBlock4
}

// ─── LEB128 (unsigned varint, protobuf-style) ─────────────────────────────────

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

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a .map file ArrayBuffer into the four raw JSON blocks.
 * Throws on any format error.
 */
export async function parseMapFile(buffer: ArrayBuffer): Promise<RawMapBlocks> {
  // Decompress gzip — use pipeThrough to avoid backpressure deadlock.
  // (Awaiting writer.write before starting reader.read deadlocks once the
  //  decompressed output exceeds the stream's internal buffer size.)
  const compressed = new Uint8Array(buffer)
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const decompressedBuf = await new Response(stream).arrayBuffer()
  const data = new Uint8Array(decompressedBuf)

  // ── Skip header ─────────────────────────────────────────────────────────────
  let pos = 0
  const decoder = new TextDecoder('utf-8')

  function requireBytes(n: number, label: string) {
    if (pos + n > data.length)
      throw new Error(`.map header truncated at "${label}" (offset ${pos}, need ${n} bytes, have ${data.length - pos})`)
  }

  // 1-byte hashLen + hash bytes
  requireBytes(1, 'hashLen')
  const hashLen = data[pos++]
  requireBytes(hashLen, 'hash')
  pos += hashLen

  // 1-byte verLen + version bytes
  requireBytes(1, 'verLen')
  const verLen = data[pos++]
  requireBytes(verLen, 'version')
  const version = decoder.decode(data.subarray(pos - verLen, pos))
  pos += verLen

  // 2-byte separator (value varies across map versions — just skip)
  requireBytes(2, 'separator')
  const sep0 = data[pos], sep1 = data[pos + 1]
  pos += 2

  console.log('[map-parser] header:', {
    decompressedBytes: data.length,
    hashLen, verLen, version,
    sep: `${sep0.toString(16)} ${sep1.toString(16)}`,
    posAfterHeader: pos,
  })

  // ── Read 4 varint-framed JSON blocks ─────────────────────────────────────────
  const blocks: unknown[] = []

  for (let i = 0; i < 4; i++) {
    // Some maps (e.g. scenario-less maps) ship with fewer than 4 blocks.
    // Treat any missing or zero-length block as an empty object so the rest
    // of the pipeline can apply safe ?? [] fallbacks instead of crashing.
    if (pos >= data.length) {
      console.log(`[map-parser] block${i + 1}: past end of data, using {}`)
      blocks.push({})
      continue
    }
    const { value: byteLen, next } = readVarint(data, pos)
    pos = next
    if (byteLen === 0 || pos + byteLen > data.length) {
      // Block is absent or truncated — skip whatever bytes remain and push empty.
      console.log(`[map-parser] block${i + 1}: byteLen=${byteLen} truncated or zero, using {}`)
      pos += Math.min(byteLen, Math.max(0, data.length - pos))
      blocks.push({})
      continue
    }
    const jsonBytes = data.subarray(pos, pos + byteLen)
    pos += byteLen
    let jsonText = decoder.decode(jsonBytes)
    // Strip UTF-8 BOM if present
    if (jsonText.charCodeAt(0) === 0xfeff) jsonText = jsonText.slice(1)
    try {
      const parsed = JSON.parse(jsonText)
      console.log(`[map-parser] block${i + 1}: byteLen=${byteLen}, topLevelKeys=`, Object.keys(parsed as object))
      blocks.push(parsed)
    } catch (err) {
      console.warn(`[map-parser] block${i + 1}: JSON parse failed`, err, jsonText.slice(0, 200))
      blocks.push({})
    }
  }

  return {
    block1: blocks[0] as RawMapBlock1,
    block2: blocks[1] as RawMapBlock2,
    block3: blocks[2] as RawMapBlock3,
    block4: blocks[3] as RawMapBlock4,
  }
}
