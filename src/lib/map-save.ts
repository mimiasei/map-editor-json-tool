// ─── Apply edits to a `.map` container, and persist that container to disk ──
// Split in two (issue #195 follow-up: in-memory document model) so an edit
// can be applied to whatever container is currently held in memory
// (`useMapDocumentStore`) without touching disk at all, and disk is only
// ever touched by an explicit Save. `applyMapEdit` and `writeMapChunks`
// below are exactly the two halves `saveMapFile` (issue #120's original
// "does the game accept a repacked map" test feature) used to do as one
// atomic disk-read-then-disk-write operation — the verify-before-commit
// rigor is unchanged, it just now verifies against an in-memory container
// instead of a freshly-read one. `saveMapFile` itself survives as a thin
// read-apply-write wrapper, since Toolbar.tsx's debug "re-save unchanged"
// menu item (issue #120's original no-op-repack test) still needs exactly
// that one-shot shape and has nothing to do with this feature.

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
  swapSpawnerOwners,
  upsertPropPortals,
  setCustomCityName,
  upsertPropHero,
  setCitySpawnHero,
  setCityFaction,
  upsertPropSquads,
  upsertPropRandomSquads,
  setRandomSquadValue,
  upsertPropRewardParams,
  moveObjectInstance,
  rotateObjectInstance,
  paintTerrainTiles,
  paintLevelTiles,
  paintWaterTiles,
  paintRoadTiles,
  paintClimbTiles,
  paintRiverTiles,
  addObjectInstance,
  addMarkerInstance,
  deleteObjectInstance,
  paintObjects,
  clearAllObjects,
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
  | { kind: 'swapSpawnerOwner'; entityType: number; entityId: number; newOwner: number }
  | { kind: 'setPortalTarget'; entityType: number; entityId: number; targetIdx?: number; isActive?: boolean }
  | { kind: 'setCityName'; entityType: number; entityId: number; customCityName: string }
  | { kind: 'setHeroSid'; entityType: number; entityId: number; heroSid: string }
  | { kind: 'setCitySpawnHero'; entityType: number; entityId: number; spawnHero: boolean }
  | { kind: 'setCityFaction'; entityType: number; entityId: number; factionSid: string }
  | { kind: 'setGuardSquad'; entityType: number; entityId: number; unitProps: { sid: string; count: number }[] }
  | { kind: 'setCityGarrison'; entityType: number; entityId: number; sids: string[] }
  | { kind: 'setRandomSquadValue'; entityType: number; entityId: number; requestedValue: number }
  | { kind: 'setRewardParams'; entityType: number; entityId: number; parameters: string[] }
  | { kind: 'moveObject'; entityType: 0 | 1 | 2; entityId: number; newNode: number }
  | { kind: 'rotateObject'; entityId: number; newRotation: number }
  | { kind: 'addObject'; entityType: 0 | 2; sid: string; node: number; rotation?: number; level?: number }
  | { kind: 'addMarker'; sid: string; node: number }
  | { kind: 'deleteObject'; entityType: 0 | 1 | 2; entityId: number }
  | { kind: 'paintTerrain'; changes: { node: number; biomeId: number }[] }
  | { kind: 'paintLevel'; changes: { node: number; level: number }[] }
  | { kind: 'paintWater'; changes: { node: number; waterId: number }[] }
  | { kind: 'paintRoad'; changes: { node: number; roadId: number }[] }
  | { kind: 'paintClimb'; changes: { node: number; climb: 0 | 1 }[] }
  | { kind: 'paintRiver'; changes: { node: number; s: number; isWaterfall?: boolean }[]; deletions?: number[] }
  | { kind: 'paintObjects'; additions: { node: number; sid: string; randomSquadOverrides?: { requestedValue: number; fraction: string } }[]; deletions: number[] }
  | { kind: 'clearAll' }

/** Which chunk indices a given edit touches — every edit but setSpawnerPlayerType/
 *  swapSpawnerOwner/deleteObject/addObject/paintObjects/setHeroSid/setCitySpawnHero/
 *  setCityFaction is scoped to Block 2 (chunks[1]) alone; those also touch
 *  Block 1 (chunks[0]) — setSpawnerPlayerType because the Player type is
 *  duplicated across both, deleteObject because deleting a spawner also
 *  needs to clear its paired Block 1 spawns.spawns[] entry, addObject/
 *  paintObjects because adding a city-spawner/hero-spawner needs to claim an
 *  unclaimed player slot there, and setHeroSid/setCitySpawnHero/
 *  setCityFaction because Block 1's spawns.spawns[] duplicates
 *  factionSid/isCityDefined/heroSid/isHeroDefined per owner — confirmed via
 *  a real map (Stormlight.map) whose faction/hero edits only took effect
 *  in-game after Block 1 was also updated (originally only GME did this;
 *  see setCityFaction/setCitySpawnHero/upsertPropHero in map-write.ts) —
 *  every OTHER sid leaves Block 1 untouched, but this flag is a coarse
 *  per-kind allowance, not per-sid — see each function's own doc comment in
 *  map-write.ts). */
function editedChunkIndices(edit?: MapSaveEdit): Set<number> {
  if (!edit) return new Set()
  return edit.kind === 'setSpawnerPlayerType' || edit.kind === 'swapSpawnerOwner' || edit.kind === 'deleteObject' || edit.kind === 'addObject' || edit.kind === 'paintObjects' || edit.kind === 'setHeroSid' || edit.kind === 'setCitySpawnHero' || edit.kind === 'setCityFaction' || edit.kind === 'clearAll'
    ? new Set([0, 1])
    : new Set([1])
}

export interface ApplyMapEditResult {
  /** The new container — apply's output never mutates the input container. */
  container: MapContainer
  /** The id allocated by an 'addObject'/'addMarker' edit — absent for every
   *  other edit kind. Lets the caller immediately reference/select the new
   *  instance without a second read of the map. */
  newId?: number
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
 * Apply one edit to an in-memory `.map` container (or, called with no
 * `edit`, just a no-op "rebuild and verify unchanged" pass), verify the
 * rebuilt bytes before returning. Never touches disk — see `writeMapChunks`
 * for that. Throws (leaving the caller's own container reference untouched)
 * if the edit's own semantic assertion fails against the rebuilt bytes.
 */
export function applyMapEdit(container: MapContainer, edit?: MapSaveEdit): ApplyMapEditResult {
  // Both edit kinds target block 2 (chunks[1]) — anything with fewer chunks
  // than that has nothing for either to target.
  if (container.chunks.length < 2) {
    throw new Error(`Expected at least 2 blocks, found ${container.chunks.length} — refusing to write`)
  }

  const newChunks = container.chunks.slice()
  let addedId: number | undefined
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
  } else if (edit?.kind === 'swapSpawnerOwner') {
    const patched = swapSpawnerOwners(newChunks[0], newChunks[1], edit.entityType, edit.entityId, edit.newOwner)
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
    const patched = upsertPropHero(newChunks[0], newChunks[1], edit.entityType, edit.entityId, edit.heroSid)
    newChunks[0] = patched.block1Chunk
    newChunks[1] = patched.block2Chunk
  } else if (edit?.kind === 'setCitySpawnHero') {
    const patched = setCitySpawnHero(newChunks[0], newChunks[1], edit.entityType, edit.entityId, edit.spawnHero)
    newChunks[0] = patched.block1Chunk
    newChunks[1] = patched.block2Chunk
  } else if (edit?.kind === 'setCityFaction') {
    const patched = setCityFaction(newChunks[0], newChunks[1], edit.entityType, edit.entityId, edit.factionSid)
    newChunks[0] = patched.block1Chunk
    newChunks[1] = patched.block2Chunk
  } else if (edit?.kind === 'setGuardSquad') {
    newChunks[1] = upsertPropSquads(newChunks[1], edit.entityType, edit.entityId, edit.unitProps)
  } else if (edit?.kind === 'setCityGarrison') {
    newChunks[1] = upsertPropRandomSquads(newChunks[1], edit.entityType, edit.entityId, edit.sids)
  } else if (edit?.kind === 'setRandomSquadValue') {
    newChunks[1] = setRandomSquadValue(newChunks[1], edit.entityType, edit.entityId, edit.requestedValue)
  } else if (edit?.kind === 'setRewardParams') {
    newChunks[1] = upsertPropRewardParams(newChunks[1], edit.entityType, edit.entityId, edit.parameters)
  } else if (edit?.kind === 'moveObject') {
    newChunks[1] = moveObjectInstance(newChunks[1], edit.entityType, edit.entityId, edit.newNode)
  } else if (edit?.kind === 'rotateObject') {
    newChunks[1] = rotateObjectInstance(newChunks[1], edit.entityId, edit.newRotation)
  } else if (edit?.kind === 'addObject') {
    const result = addObjectInstance(newChunks[0], newChunks[1], edit.entityType, edit.sid, edit.node, edit.rotation, edit.level)
    newChunks[0] = result.block1Chunk
    newChunks[1] = result.block2Chunk
    addedId = result.newId
  } else if (edit?.kind === 'addMarker') {
    const result = addMarkerInstance(newChunks[1], edit.sid, edit.node)
    newChunks[1] = result.chunk
    addedId = result.newId
  } else if (edit?.kind === 'deleteObject') {
    const result = deleteObjectInstance(newChunks[0], newChunks[1], edit.entityType, edit.entityId)
    newChunks[0] = result.block1Chunk
    newChunks[1] = result.block2Chunk
  } else if (edit?.kind === 'paintTerrain') {
    newChunks[1] = paintTerrainTiles(newChunks[1], edit.changes)
  } else if (edit?.kind === 'paintLevel') {
    newChunks[1] = paintLevelTiles(newChunks[1], edit.changes)
  } else if (edit?.kind === 'paintWater') {
    newChunks[1] = paintWaterTiles(newChunks[1], edit.changes)
  } else if (edit?.kind === 'paintRoad') {
    newChunks[1] = paintRoadTiles(newChunks[1], edit.changes)
  } else if (edit?.kind === 'paintClimb') {
    newChunks[1] = paintClimbTiles(newChunks[1], edit.changes)
  } else if (edit?.kind === 'paintRiver') {
    newChunks[1] = paintRiverTiles(newChunks[1], edit.changes, edit.deletions ?? [])
  } else if (edit?.kind === 'paintObjects') {
    const result = paintObjects(newChunks[0], newChunks[1], edit.additions, edit.deletions)
    newChunks[0] = result.block1Chunk
    newChunks[1] = result.block2Chunk
  } else if (edit?.kind === 'clearAll') {
    const result = clearAllObjects(newChunks[0], newChunks[1])
    newChunks[0] = result.block1Chunk
    newChunks[1] = result.block2Chunk
  }
  const rebuilt: MapContainer = { ...container, chunks: newChunks }
  const rebuiltDecompressed = buildMapContainer(rebuilt)

  // ── Verify before returning ───────────────────────────────────────────────
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
  } else if (edit?.kind === 'swapSpawnerOwner') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propSpawns?: Array<{ type?: number | string; id?: number; owner?: number }> }
    }
    const entry2 = (block2.objectsProperties?.propSpawns ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!entry2 || entry2.owner !== edit.newOwner) {
      throw new Error('Verification failed: new owner not reflected in the rebuilt propSpawns table')
    }
    const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
      spawns?: { spawns?: Array<{ owner?: number }> }
    }
    const owners = (block1.spawns?.spawns ?? []).map((e) => e.owner)
    if (!owners.includes(edit.newOwner) || new Set(owners).size !== owners.length) {
      throw new Error('Verification failed: owner swap left the rebuilt Block 1 spawns table with a duplicate or missing owner')
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
      objectsProperties?: {
        propHeroes?: Array<{ type?: number | string; id?: number; heroSid?: string }>
        propSpawns?: Array<{ type?: number | string; id?: number; owner?: number }>
      }
    }
    const entries = block2.objectsProperties?.propHeroes ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || match.heroSid !== edit.heroSid) {
      throw new Error('Verification failed: heroSid not reflected in the rebuilt propHeroes table')
    }
    const owner = (block2.objectsProperties?.propSpawns ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)?.owner
    const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
      spawns?: { spawns?: Array<{ owner?: number; isHeroDefined?: boolean; heroSid?: string }> }
    }
    const entry1 = (block1.spawns?.spawns ?? []).find((e) => e.owner === owner)
    const expectedDefined = edit.heroSid !== 'random'
    if (!entry1 || entry1.isHeroDefined !== expectedDefined || entry1.heroSid !== (expectedDefined ? edit.heroSid : '')) {
      throw new Error('Verification failed: heroSid not reflected in the rebuilt Block 1 spawns table')
    }
  } else if (edit?.kind === 'setCitySpawnHero') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: {
        propCities?: Array<{ type?: number | string; id?: number; spawnHero?: boolean }>
        propHeroes?: Array<{ type?: number | string; id?: number }>
        propSpawns?: Array<{ type?: number | string; id?: number; owner?: number }>
      }
    }
    const cityMatch = (block2.objectsProperties?.propCities ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    const heroRowPresent = (block2.objectsProperties?.propHeroes ?? [])
      .some((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!cityMatch || cityMatch.spawnHero !== edit.spawnHero || heroRowPresent !== edit.spawnHero) {
      throw new Error('Verification failed: spawnHero not reflected consistently in propCities/propHeroes')
    }
    const owner = (block2.objectsProperties?.propSpawns ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)?.owner
    const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
      spawns?: { spawns?: Array<{ owner?: number; isHeroDefined?: boolean; heroSid?: string }> }
    }
    const entry1 = (block1.spawns?.spawns ?? []).find((e) => e.owner === owner)
    if (!entry1 || entry1.isHeroDefined !== false || entry1.heroSid !== '') {
      throw new Error('Verification failed: spawnHero not reflected in the rebuilt Block 1 spawns table')
    }
  } else if (edit?.kind === 'setCityFaction') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: {
        propCities?: Array<{ type?: number | string; id?: number; factionSid?: string; isDefined?: boolean }>
        propSpawns?: Array<{ type?: number | string; id?: number; owner?: number }>
      }
    }
    const match = (block2.objectsProperties?.propCities ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    const expectedDefined = edit.factionSid !== ''
    if (!match || match.factionSid !== edit.factionSid || match.isDefined !== expectedDefined) {
      throw new Error('Verification failed: faction not reflected in the rebuilt propCities table')
    }
    const owner = (block2.objectsProperties?.propSpawns ?? [])
      .find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)?.owner
    const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
      spawns?: { spawns?: Array<{ owner?: number; isCityDefined?: boolean; factionSid?: string }> }
    }
    const entry1 = (block1.spawns?.spawns ?? []).find((e) => e.owner === owner)
    if (!entry1 || entry1.isCityDefined !== expectedDefined || entry1.factionSid !== edit.factionSid) {
      throw new Error('Verification failed: faction not reflected in the rebuilt Block 1 spawns table')
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
  } else if (edit?.kind === 'setRandomSquadValue') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objectsProperties?: { propRandomSquads?: Array<{ type?: number | string; id?: number; requestedValue?: number }> }
    }
    const entries = block2.objectsProperties?.propRandomSquads ?? []
    const match = entries.find((e) => String(e.type) === String(edit.entityType) && e.id === edit.entityId)
    if (!match || match.requestedValue !== edit.requestedValue) {
      throw new Error('Verification failed: requested value not reflected in the rebuilt propRandomSquads table')
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
  } else if (edit?.kind === 'moveObject') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objects?: Array<{ ids?: number[]; nodes?: number[] }>
      squads?: Array<{ ids?: number[]; nodes?: number[] }>
      markers?: Array<{ id?: number; node?: number }>
    }
    let actualNode: number | undefined
    if (edit.entityType === 1) {
      actualNode = (block2.markers ?? []).find((m) => m.id === edit.entityId)?.node
    } else {
      const groups = edit.entityType === 0 ? block2.objects ?? [] : block2.squads ?? []
      for (const group of groups) {
        const idx = group.ids?.indexOf(edit.entityId) ?? -1
        if (idx !== -1) { actualNode = group.nodes?.[idx]; break }
      }
    }
    if (actualNode !== edit.newNode) {
      throw new Error('Verification failed: move not reflected in the rebuilt placement table')
    }
  } else if (edit?.kind === 'rotateObject') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objects?: Array<{ ids?: number[]; rotations?: number[] }>
    }
    let actualRotation: number | undefined
    for (const group of block2.objects ?? []) {
      const idx = group.ids?.indexOf(edit.entityId) ?? -1
      if (idx !== -1) { actualRotation = group.rotations?.[idx]; break }
    }
    if (actualRotation !== edit.newRotation) {
      throw new Error('Verification failed: rotation not reflected in the rebuilt placement table')
    }
  } else if (edit?.kind === 'addObject') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objects?: Array<{ sid?: string; ids?: number[]; nodes?: number[] }>
      squads?: Array<{ sid?: string; ids?: number[]; nodes?: number[] }>
      objectsFreeId?: number
      squadsFreeId?: number
    }
    const groups = edit.entityType === 0 ? block2.objects ?? [] : block2.squads ?? []
    const group = groups.find((g) => g.sid === edit.sid)
    const idx = group?.ids?.indexOf(addedId!) ?? -1
    const actualNode = idx !== -1 ? group?.nodes?.[idx] : undefined
    const freeId = edit.entityType === 0 ? block2.objectsFreeId : block2.squadsFreeId
    if (actualNode !== edit.node || freeId !== addedId! + 1) {
      throw new Error('Verification failed: new instance not reflected in the rebuilt placement table')
    }
    if (edit.sid === 'city-spawner' || edit.sid === 'hero-spawner') {
      const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
        spawns?: { spawns?: Array<{ owner?: number; spawnPointType?: number }> }
      }
      const block2Props = (block2 as unknown as {
        objectsProperties?: { propSpawns?: Array<{ id?: number; owner?: number }> }
      }).objectsProperties
      const propSpawnsRow = (block2Props?.propSpawns ?? []).find((r) => r.id === addedId)
      const owner = propSpawnsRow?.owner
      const block1Entry = (block1.spawns?.spawns ?? []).find((s) => s.owner === owner)
      const expectedSpawnPointType = edit.sid === 'city-spawner' ? 0 : 1
      if (owner === undefined || !block1Entry || block1Entry.spawnPointType !== expectedSpawnPointType) {
        throw new Error('Verification failed: new spawner not reflected in the rebuilt Block 1 spawns table')
      }
    }
  } else if (edit?.kind === 'addMarker') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      markers?: Array<{ id?: number; sid?: string; node?: number }>
      markersFreeId?: number
    }
    const match = (block2.markers ?? []).find((m) => m.id === addedId)
    if (!match || match.node !== edit.node || match.sid !== edit.sid || block2.markersFreeId !== addedId! + 1) {
      throw new Error('Verification failed: new marker not reflected in the rebuilt markers table')
    }
  } else if (edit?.kind === 'deleteObject') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objects?: Array<{ ids?: number[] }>
      squads?: Array<{ ids?: number[] }>
      markers?: Array<{ id?: number }>
      objectsProperties?: Record<string, Array<{ type?: number | string; id?: number }>>
    }
    let stillPresent = false
    if (edit.entityType === 1) {
      stillPresent = (block2.markers ?? []).some((m) => m.id === edit.entityId)
    } else {
      const groups = edit.entityType === 0 ? block2.objects ?? [] : block2.squads ?? []
      stillPresent = groups.some((g) => g.ids?.includes(edit.entityId))
    }
    if (stillPresent) {
      throw new Error('Verification failed: deleted instance still present in the rebuilt placement table')
    }
    for (const table of Object.values(block2.objectsProperties ?? {})) {
      if (!Array.isArray(table)) continue
      if (table.some((row) => String(row?.type) === String(edit.entityType) && row?.id === edit.entityId)) {
        throw new Error('Verification failed: a deleted instance\'s row is still present in an objectsProperties table')
      }
    }
  } else if (edit?.kind === 'paintTerrain') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as { tilesMap?: number[] }
    const tiles = block2.tilesMap ?? []
    for (const { node, biomeId } of edit.changes) {
      if (tiles[node] !== biomeId) {
        throw new Error('Verification failed: painted tile not reflected in the rebuilt tilesMap')
      }
    }
  } else if (edit?.kind === 'paintLevel') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as { levelsMap?: number[]; waterMap?: number[] }
    const levels = block2.levelsMap ?? []
    const water = block2.waterMap ?? []
    for (const { node, level } of edit.changes) {
      if (levels[node] !== level) {
        throw new Error('Verification failed: painted level not reflected in the rebuilt levelsMap')
      }
      if (level !== -1 && water[node] !== 0) {
        throw new Error('Verification failed: water not cleared in the rebuilt waterMap for a tile raised off level -1')
      }
    }
  } else if (edit?.kind === 'paintWater') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as { waterMap?: number[] }
    const water = block2.waterMap ?? []
    for (const { node, waterId } of edit.changes) {
      if (water[node] !== waterId) {
        throw new Error('Verification failed: painted water not reflected in the rebuilt waterMap')
      }
    }
  } else if (edit?.kind === 'paintRoad') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as { roadsMap?: number[] }
    const roads = block2.roadsMap ?? []
    for (const { node, roadId } of edit.changes) {
      if (roads[node] !== roadId) {
        throw new Error('Verification failed: painted road not reflected in the rebuilt roadsMap')
      }
    }
  } else if (edit?.kind === 'paintClimb') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as { climbsMap?: number[] }
    const climbs = block2.climbsMap ?? []
    for (const { node, climb } of edit.changes) {
      if (climbs[node] !== climb) {
        throw new Error('Verification failed: painted ramp not reflected in the rebuilt climbsMap')
      }
    }
  } else if (edit?.kind === 'paintRiver') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      rivers?: Array<{ nodes?: Array<{ n: number; s: number }> }>
    }
    const nodes = block2.rivers?.[0]?.nodes ?? []
    const byNode = new Map(nodes.map((n) => [n.n, n.s]))
    for (const { node, s } of edit.changes) {
      if (byNode.get(node) !== s) {
        throw new Error('Verification failed: painted river node not reflected in the rebuilt rivers array')
      }
    }
    for (const node of edit.deletions ?? []) {
      if (byNode.has(node)) {
        throw new Error('Verification failed: deleted river node still present in the rebuilt rivers array')
      }
    }
  } else if (edit?.kind === 'paintObjects') {
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objects?: Array<{ sid?: string; ids?: number[]; nodes?: number[] }>
      objectsProperties?: { propRandomSquads?: Array<{ type?: number | string; id?: number; requestedValue?: number; fraction?: string }> }
    }
    const groups = block2.objects ?? []
    for (const id of edit.deletions) {
      if (groups.some((g) => g.ids?.includes(id))) {
        throw new Error('Verification failed: painted-over instance still present in the rebuilt placement table')
      }
    }
    for (const { node, sid, randomSquadOverrides } of edit.additions) {
      const group = groups.find((g) => g.sid === sid)
      const nodeIdx = (group?.nodes ?? []).indexOf(node)
      if (nodeIdx === -1) {
        throw new Error('Verification failed: painted instance not reflected in the rebuilt placement table')
      }
      if (randomSquadOverrides) {
        const newId = group?.ids?.[nodeIdx]
        const row = (block2.objectsProperties?.propRandomSquads ?? []).find((r) => String(r.type) === '0' && r.id === newId)
        if (!row || row.requestedValue !== randomSquadOverrides.requestedValue || row.fraction !== randomSquadOverrides.fraction) {
          throw new Error('Verification failed: Encounter squad requestedValue/fraction not reflected in the rebuilt propRandomSquads row')
        }
      }
    }
  } else if (edit?.kind === 'clearAll') {
    const block1 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[0])) as {
      spawns?: { playersCount?: number; spawns?: unknown[] }
    }
    const block2 = JSON.parse(new TextDecoder('utf-8').decode(reparsed.chunks[1])) as {
      objects?: Array<{ ids?: number[] }>
      squads?: unknown[]
      markers?: unknown[]
      rivers?: Array<{ nodes?: unknown[] }>
      tilesMap?: number[]
    }
    const survivingIds = (block2.objects ?? []).flatMap((g) => g.ids ?? [])
    if (survivingIds.length > 0 || (block2.squads?.length ?? 0) > 0 || (block2.markers?.length ?? 0) > 0) {
      throw new Error('Verification failed: clear-all left objects/squads/markers behind')
    }
    if ((block2.rivers?.[0]?.nodes?.length ?? 0) > 0) {
      throw new Error('Verification failed: clear-all left river nodes behind')
    }
    if ((block2.tilesMap ?? []).some((t) => t !== 1)) {
      throw new Error('Verification failed: clear-all left a non-Grass tile behind')
    }
    if ((block1.spawns?.spawns?.length ?? 0) > 0 || (block1.spawns?.playersCount ?? 0) !== 0) {
      throw new Error('Verification failed: clear-all left Block 1 player-start spawns behind')
    }
  }

  return { container: reparsed, newId: addedId }
}

/**
 * Persist a `.map` container to disk: gzip, back up the file currently at
 * `mapFilePath` (once — never overwrites an existing `.bak`, and always
 * against whatever's actually on disk right now, not a possibly-stale
 * in-memory snapshot), write the result, then re-parse what actually landed
 * on disk back into the map-context store.
 */
export async function writeMapChunks(mapFilePath: string, container: MapContainer): Promise<MapSaveResult> {
  const gzipped = await gzipBytes(buildMapContainer(container))

  const backupPath = `${mapFilePath}.bak`
  const backupCreated = !(await checkFileExists(backupPath))
  if (backupCreated) {
    const currentBuffer = await readBinaryFile(mapFilePath)
    if (currentBuffer) await writeBinaryFile(backupPath, new Uint8Array(currentBuffer))
  }

  await writeBinaryFile(mapFilePath, gzipped)

  const reparsedBlocks = await parseMapFile(toArrayBuffer(gzipped))
  useMapContextStore.getState().setContext(extractMapContext(reparsedBlocks))

  return { backupPath, backupCreated, bytesWritten: gzipped.length }
}

/**
 * Read `.map` at `mapFilePath`, apply one edit (or, with no `edit`, just a
 * no-op "re-save unchanged" control action — same write path, zero semantic
 * changes, used to isolate whether re-packing itself is accepted by the
 * game), and write the result — the one-shot read+apply+write combination
 * `applyMapEdit`/`writeMapChunks` split apart. Kept only for Toolbar.tsx's
 * debug "Re-save map (no changes)" menu item (issue #120's original test);
 * everything else should hold its own `MapContainer` in memory
 * (`useMapDocumentStore`) and call `applyMapEdit`/`writeMapChunks` directly.
 */
export async function saveMapFile(mapFilePath: string, edit?: MapSaveEdit): Promise<MapSaveResult & { newId?: number }> {
  const originalBuffer = await readBinaryFile(mapFilePath)
  if (!originalBuffer) throw new Error(`Could not read "${mapFilePath}"`)
  const decompressed = await gunzipBytes(new Uint8Array(originalBuffer))
  const container = readMapContainer(decompressed)

  const { container: editedContainer, newId } = applyMapEdit(container, edit)
  const result = await writeMapChunks(mapFilePath, editedContainer)
  return { ...result, newId }
}
