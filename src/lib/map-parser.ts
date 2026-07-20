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
  spawns?: Array<{
    owner?: string
    factionSid?: string
    heroSid?: string
    colorId?: number
    isLocked?: boolean
  }>
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
  objects?: Array<{
    sid?: string | string[]
    ids?: number[]
    nodes?: unknown[]
  }>
  objectsProperties?: {
    propEntities?: Array<{ type?: string; id?: number; sid?: string }>
    propHeroes?: Array<{ type?: string; id?: number; isDefined?: boolean; heroSid?: string }>
    [key: string]: unknown
  }
  squads?: unknown[]
  markers?: unknown[]
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
  // Decompress gzip
  const compressed = new Uint8Array(buffer)
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()

  // Await write + close to avoid a race where reads start before data is flushed
  await writer.write(compressed)
  await writer.close()

  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const data = new Uint8Array(totalLen)
  let off = 0
  for (const chunk of chunks) {
    data.set(chunk, off)
    off += chunk.length
  }

  // ── Skip header ─────────────────────────────────────────────────────────────
  let pos = 0

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
  pos += verLen

  // 2 bytes 0x0D 0x00
  requireBytes(2, 'separator')
  pos += 2

  // ── Read 4 varint-framed JSON blocks ─────────────────────────────────────────
  const decoder = new TextDecoder('utf-8')
  const blocks: unknown[] = []

  for (let i = 0; i < 4; i++) {
    const { value: byteLen, next } = readVarint(data, pos)
    pos = next
    if (pos + byteLen > data.length)
      throw new Error(`.map block ${i + 1} truncated: claims ${byteLen} bytes but only ${data.length - pos} remain`)
    const jsonBytes = data.subarray(pos, pos + byteLen)
    pos += byteLen
    let jsonText = decoder.decode(jsonBytes)
    // Strip UTF-8 BOM if present
    if (jsonText.charCodeAt(0) === 0xfeff) jsonText = jsonText.slice(1)
    blocks.push(JSON.parse(jsonText))
  }

  return {
    block1: blocks[0] as RawMapBlock1,
    block2: blocks[1] as RawMapBlock2,
    block3: blocks[2] as RawMapBlock3,
    block4: blocks[3] as RawMapBlock4,
  }
}
