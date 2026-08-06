// ─── Write entity SID edits (and no-op repacks) back to the .map file ────────
// Desktop-only test feature — see issue #120: this exists to answer, once and
// for all, whether the game accepts a map this tool has re-packed, given that
// the `.map` header carries a hash whose algorithm is unknown. Every write
// re-reads the file from disk (mapFilePath is all the store keeps — the raw
// buffer is intentionally not retained, see map-file.ts), verifies the
// rebuilt bytes before ever touching disk, and keeps a one-time backup.

import { readBinaryFile, writeBinaryFile, checkFileExists } from '@/lib/native-fs'
import {
  readMapContainer,
  buildMapContainer,
  gzipBytes,
  gunzipBytes,
  renameEntitySid,
  bytesEqual,
  type MapContainer,
} from '@/lib/map-write'
import { parseMapFile } from '@/lib/map-parser'
import { extractMapContext } from '@/lib/map-extract'
import { useMapContextStore } from '@/store/useMapContextStore'

export interface MapSaveEdit {
  oldSid: string
  newSid: string
}

export interface MapSaveResult {
  backupPath: string
  backupCreated: boolean
  bytesWritten: number
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Every chunk must still parse as JSON after the rebuild — a cheap sanity net. */
function assertAllChunksAreJson(container: MapContainer) {
  const decoder = new TextDecoder('utf-8')
  for (let i = 0; i < container.chunks.length; i++) {
    try {
      JSON.parse(decoder.decode(container.chunks[i]))
    } catch (e) {
      throw new Error(`Verification failed: chunk ${i} is not valid JSON after rebuild (${e instanceof Error ? e.message : String(e)})`)
    }
  }
}

/**
 * Re-read the .map at `mapFilePath`, optionally rename one propEntities SID
 * (block 2), verify the rebuilt bytes before writing anything, back up the
 * original (once — never overwrites an existing .bak), write the result, then
 * re-parse what actually landed on disk back into the map-context store.
 *
 * Called with no `edit` this is the no-op "re-save unchanged" control action —
 * same write path, zero semantic changes, used to isolate whether re-packing
 * itself (independent of any edit) is accepted by the game.
 */
export async function saveMapFile(mapFilePath: string, edit?: MapSaveEdit): Promise<MapSaveResult> {
  const originalBuffer = await readBinaryFile(mapFilePath)
  if (!originalBuffer) throw new Error(`Could not read "${mapFilePath}"`)
  const originalBytes = new Uint8Array(originalBuffer)

  const decompressed = await gunzipBytes(originalBytes)
  const container = readMapContainer(decompressed)

  // propEntities lives in block 2 (chunks[1]) — anything with fewer chunks
  // than that has nothing for a SID edit to target.
  if (container.chunks.length < 2) {
    throw new Error(`Expected at least 2 blocks, found ${container.chunks.length} — refusing to write`)
  }

  const newChunks = container.chunks.slice()
  if (edit) {
    newChunks[1] = renameEntitySid(newChunks[1], edit.oldSid, edit.newSid)
  }
  const rebuilt: MapContainer = { ...container, chunks: newChunks }
  const rebuiltDecompressed = buildMapContainer(rebuilt)

  // ── Verify before touching disk ──────────────────────────────────────────
  const reparsed = readMapContainer(rebuiltDecompressed)

  if (reparsed.chunks.length !== container.chunks.length) {
    throw new Error('Verification failed: chunk count changed after rebuild')
  }
  if (!bytesEqual(reparsed.hash, container.hash) || !bytesEqual(reparsed.version, container.version)) {
    throw new Error('Verification failed: header changed unexpectedly')
  }
  for (let i = 0; i < reparsed.chunks.length; i++) {
    const isEditedChunk = edit && i === 1
    if (!isEditedChunk && !bytesEqual(reparsed.chunks[i], container.chunks[i])) {
      throw new Error(`Verification failed: block ${i} changed unexpectedly`)
    }
  }
  assertAllChunksAreJson(reparsed)

  if (edit) {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propEntities?: Array<{ sid?: string }> }
    }
    const sids = block2.objectsProperties?.propEntities?.map((e) => e.sid) ?? []
    if (sids.includes(edit.oldSid) || !sids.includes(edit.newSid)) {
      throw new Error('Verification failed: rename not reflected in the rebuilt propEntities table')
    }
  }

  const gzipped = await gzipBytes(rebuiltDecompressed)

  // ── Back up the original (once) ──────────────────────────────────────────
  const backupPath = `${mapFilePath}.bak`
  const backupCreated = !(await checkFileExists(backupPath))
  if (backupCreated) {
    await writeBinaryFile(backupPath, originalBytes)
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  await writeBinaryFile(mapFilePath, gzipped)

  // ── Reflect what's actually on disk in the sidebar ───────────────────────
  const reparsedBlocks = await parseMapFile(toArrayBuffer(gzipped))
  useMapContextStore.getState().setContext(extractMapContext(reparsedBlocks))

  return { backupPath, backupCreated, bytesWritten: gzipped.length }
}
