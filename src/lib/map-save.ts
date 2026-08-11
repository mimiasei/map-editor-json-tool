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
  upsertPropsName,
  upsertPropEntities,
  setNoCombineGeometry,
  setSpawnerPlayerType,
  upsertPropPortals,
  setCustomCityName,
  upsertPropHero,
  upsertPropSquads,
  upsertPropRandomSquads,
  upsertPropRewardParams,
  bytesEqual,
  type MapContainer,
} from '@/lib/map-write'
import { parseMapFile } from '@/lib/map-parser'
import { extractMapContext } from '@/lib/map-extract'
import { useMapContextStore } from '@/store/useMapContextStore'

export type MapSaveEdit =
  | { kind: 'renameSid'; oldSid: string; newSid: string }
  | { kind: 'setDisplayName'; entityType: number; entityId: number; nameTitle: string; description?: string }
  | { kind: 'assignEntitySid'; entityType: number; entityId: number; sid: string }
  | { kind: 'setNoCombineGeometry'; entityType: number; entityId: number; value: boolean }
  | { kind: 'setSpawnerPlayerType'; entityType: number; entityId: number; spawnType: 0 | 1 | 2 }
  | { kind: 'setPortalTarget'; entityType: number; entityId: number; targetIdx?: number; isActive?: boolean }
  | { kind: 'setCityName'; entityType: number; entityId: number; customCityName: string }
  | { kind: 'setHeroSid'; entityType: number; entityId: number; heroSid: string }
  | { kind: 'setGuardSquad'; entityType: number; entityId: number; unitProps: { sid: string; count: number }[] }
  | { kind: 'setCityGarrison'; entityType: number; entityId: number; sids: string[] }
  | { kind: 'setRewardParams'; entityType: number; entityId: number; parameters: string[] }

/** Which chunk indices a given edit touches — every edit but setSpawnerPlayerType
 *  is scoped to Block 2 (chunks[1]) alone; that one also touches Block 1 (chunks[0]),
 *  since the Player type is duplicated across both (see setSpawnerPlayerType's doc comment). */
function editedChunkIndices(edit?: MapSaveEdit): Set<number> {
  if (!edit) return new Set()
  return edit.kind === 'setSpawnerPlayerType' ? new Set([0, 1]) : new Set([1])
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
 * Re-read the .map at `mapFilePath`, optionally apply one edit to block 2
 * (rename a propEntities SID, or set a propsName display name), verify the
 * rebuilt bytes before writing anything, back up the original (once — never
 * overwrites an existing .bak), write the result, then re-parse what actually
 * landed on disk back into the map-context store.
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

  // Both edit kinds target block 2 (chunks[1]) — anything with fewer chunks
  // than that has nothing for either to target.
  if (container.chunks.length < 2) {
    throw new Error(`Expected at least 2 blocks, found ${container.chunks.length} — refusing to write`)
  }

  const newChunks = container.chunks.slice()
  if (edit?.kind === 'renameSid') {
    newChunks[1] = renameEntitySid(newChunks[1], edit.oldSid, edit.newSid)
  } else if (edit?.kind === 'setDisplayName') {
    newChunks[1] = upsertPropsName(newChunks[1], edit.entityType, edit.entityId, {
      nameTitle: edit.nameTitle,
      description: edit.description,
    })
  } else if (edit?.kind === 'assignEntitySid') {
    newChunks[1] = upsertPropEntities(newChunks[1], edit.entityType, edit.entityId, edit.sid)
  } else if (edit?.kind === 'setNoCombineGeometry') {
    newChunks[1] = setNoCombineGeometry(newChunks[1], edit.entityType, edit.entityId, edit.value)
  } else if (edit?.kind === 'setSpawnerPlayerType') {
    const patched = setSpawnerPlayerType(newChunks[0], newChunks[1], edit.entityType, edit.entityId, edit.spawnType)
    newChunks[0] = patched.block1Chunk
    newChunks[1] = patched.block2Chunk
  } else if (edit?.kind === 'setPortalTarget') {
    newChunks[1] = upsertPropPortals(newChunks[1], edit.entityType, edit.entityId, {
      targetIdx: edit.targetIdx,
      isActive: edit.isActive,
    })
  } else if (edit?.kind === 'setCityName') {
    newChunks[1] = setCustomCityName(newChunks[1], edit.entityType, edit.entityId, edit.customCityName)
  } else if (edit?.kind === 'setHeroSid') {
    newChunks[1] = upsertPropHero(newChunks[1], edit.entityType, edit.entityId, edit.heroSid)
  } else if (edit?.kind === 'setGuardSquad') {
    newChunks[1] = upsertPropSquads(newChunks[1], edit.entityType, edit.entityId, edit.unitProps)
  } else if (edit?.kind === 'setCityGarrison') {
    newChunks[1] = upsertPropRandomSquads(newChunks[1], edit.entityType, edit.entityId, edit.sids)
  } else if (edit?.kind === 'setRewardParams') {
    newChunks[1] = upsertPropRewardParams(newChunks[1], edit.entityType, edit.entityId, edit.parameters)
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
  const editedIndices = editedChunkIndices(edit)
  for (let i = 0; i < reparsed.chunks.length; i++) {
    if (!editedIndices.has(i) && !bytesEqual(reparsed.chunks[i], container.chunks[i])) {
      throw new Error(`Verification failed: block ${i} changed unexpectedly`)
    }
  }
  assertAllChunksAreJson(reparsed)

  if (edit?.kind === 'renameSid') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propEntities?: Array<{ sid?: string }> }
    }
    const sids = block2.objectsProperties?.propEntities?.map((e) => e.sid) ?? []
    if (sids.includes(edit.oldSid) || !sids.includes(edit.newSid)) {
      throw new Error('Verification failed: rename not reflected in the rebuilt propEntities table')
    }
  } else if (edit?.kind === 'setDisplayName') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propsName?: Array<{ type?: number | string; id?: number; nameTitle?: string; description?: string }> }
    }
    const entries = block2.objectsProperties?.propsName ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    const descriptionOk = edit.description === undefined || match?.description === edit.description
    if (!match || match.nameTitle !== edit.nameTitle || !descriptionOk) {
      throw new Error('Verification failed: display name not reflected in the rebuilt propsName table')
    }
  } else if (edit?.kind === 'assignEntitySid') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propEntities?: Array<{ type?: number | string; id?: number; sid?: string }> }
    }
    const entries = block2.objectsProperties?.propEntities ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || match.sid !== edit.sid) {
      throw new Error('Verification failed: entity SID not reflected in the rebuilt propEntities table')
    }
  } else if (edit?.kind === 'setNoCombineGeometry') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propNoCombineGeometries?: Array<{ type?: number | string; id?: number; isNoCombineGeometry?: boolean }> }
    }
    const entries = block2.objectsProperties?.propNoCombineGeometries ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || match.isNoCombineGeometry !== edit.value) {
      throw new Error('Verification failed: No Combine Geometry not reflected in the rebuilt table')
    }
  } else if (edit?.kind === 'setSpawnerPlayerType') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propSpawns?: Array<{ type?: number | string; id?: number; owner?: number; spawnType?: number }> }
    }
    const entry2 = (block2.objectsProperties?.propSpawns ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!entry2 || entry2.spawnType !== edit.spawnType) {
      throw new Error('Verification failed: Player type not reflected in the rebuilt propSpawns table')
    }
    const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
      spawns?: { spawns?: Array<{ owner?: number; spawnType?: number }> }
    }
    const entry1 = (block1.spawns?.spawns ?? []).find((e) => e.owner === entry2.owner)
    if (!entry1 || entry1.spawnType !== edit.spawnType) {
      throw new Error('Verification failed: Player type not reflected in the rebuilt Block 1 spawns table')
    }
  } else if (edit?.kind === 'setPortalTarget') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propPortals?: Array<{ type?: number | string; id?: number; targetIdx?: number; isActive?: boolean }> }
    }
    const match = (block2.objectsProperties?.propPortals ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    const targetOk = edit.targetIdx === undefined || match?.targetIdx === edit.targetIdx
    const activeOk = edit.isActive === undefined || match?.isActive === edit.isActive
    if (!match || !targetOk || !activeOk) {
      throw new Error('Verification failed: portal target not reflected in the rebuilt propPortals table')
    }
  } else if (edit?.kind === 'setCityName') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propCities?: Array<{ type?: number | string; id?: number; customCityName?: string }> }
    }
    const entries = block2.objectsProperties?.propCities ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || match.customCityName !== edit.customCityName) {
      throw new Error('Verification failed: city name not reflected in the rebuilt propCities table')
    }
  } else if (edit?.kind === 'setHeroSid') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propHeroes?: Array<{ type?: number | string; id?: number; heroSid?: string }> }
    }
    const entries = block2.objectsProperties?.propHeroes ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || match.heroSid !== edit.heroSid) {
      throw new Error('Verification failed: heroSid not reflected in the rebuilt propHeroes table')
    }
  } else if (edit?.kind === 'setGuardSquad') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propSquads?: Array<{ type?: number | string; id?: number; unitProps?: Array<{ sid?: string; count?: number }> }> }
    }
    const entries = block2.objectsProperties?.propSquads ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || JSON.stringify(match.unitProps) !== JSON.stringify(edit.unitProps)) {
      throw new Error('Verification failed: guard squad not reflected in the rebuilt propSquads table')
    }
  } else if (edit?.kind === 'setCityGarrison') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propRandomSquads?: Array<{ type?: number | string; id?: number; sids?: string[] }> }
    }
    const entries = block2.objectsProperties?.propRandomSquads ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || JSON.stringify(match.sids) !== JSON.stringify(edit.sids)) {
      throw new Error('Verification failed: garrison not reflected in the rebuilt propRandomSquads table')
    }
  } else if (edit?.kind === 'setRewardParams') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propRewardParams?: Array<{ type?: number | string; id?: number; parameters?: string[] }> }
    }
    const entries = block2.objectsProperties?.propRewardParams ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || JSON.stringify(match.parameters) !== JSON.stringify(edit.parameters)) {
      throw new Error('Verification failed: reward params not reflected in the rebuilt propRewardParams table')
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
