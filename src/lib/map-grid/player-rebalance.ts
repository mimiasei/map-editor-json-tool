// ─── Rebalance suggestions for the Map Fairness tool ──────────────────────────
// Turns the gaps in a PlayerBalance into concrete edits the user can accept one by one:
//  - land: a player whose area is clearly smaller (larger) than the typical player's has it grown (shrunk) by painting tiles next to
//    it, the nearest to the player's start first, until it matches the median. Only dry tiles count, as in the score.
//  - sites: a player with clearly fewer sites than the typical one gets resource pickups of the kinds the richest player's area has, on
//    free tiles of their own area.
// Mine distance and elevation are not touched: moving a mine leaves its guard behind and the terrain is the map's own shape.
// The suggestions come from the same numbers as the score, not from game rules, and are planned against the map as it is now, so
// applying some of them changes what the others measured; the fairness report is recomputed afterwards.

import i18n from '@/lib/i18n'
import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import type { MapSaveEdit } from '@/lib/map-save'
import { buildBlockedTileSet, objectBlockedCells } from './passability'
import { collectArtifactSids } from '@/lib/rmg/object-variety'
import { guardCategoryOf, isGuardCandidate } from '@/lib/rmg/zone-guard-scatter'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { groupPlayerStartsByZone } from './zone-ownership'
import type { PlayerBalance, PlayerBalanceRow } from './player-balance'

export interface RebalanceSuggestion {
  id: string
  kind: 'land' | 'sites'
  owner: number
  /** What it does, in the UI language. */
  text: string
  edits: MapSaveEdit[]
}

/** Gaps smaller than this share of the median are left alone (the score's own threshold for flagging a player). */
const LAND_TOLERANCE = 0.1
const MAX_SITES_PER_PLAYER = 8
/** Keeps new sites off the player's start and away from each other. */
const MIN_START_DISTANCE = 4
const MIN_SITE_SPACING = 5

class Heap {
  private items: { key: number; node: number }[] = []
  constructor(private readonly max: boolean) {}
  get size(): number { return this.items.length }
  push(node: number, key: number): void {
    const items = this.items
    items.push({ key, node })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.before(items[parent], items[i])) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }
  pop(): number | undefined {
    const items = this.items
    if (items.length === 0) return undefined
    const top = items[0].node
    const last = items.pop() as { key: number; node: number }
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let best = i
        if (l < items.length && this.before(items[l], items[best])) best = l
        if (r < items.length && this.before(items[r], items[best])) best = r
        if (best === i) break
        ;[items[best], items[i]] = [items[i], items[best]]
        i = best
      }
    }
    return top
  }
  private before(a: { key: number }, b: { key: number }): boolean {
    return this.max ? a.key >= b.key : a.key <= b.key
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function planRebalance(context: MapContext, catalog: GameCatalog | null, balance: PlayerBalance | null): RebalanceSuggestion[] {
  if (!balance || balance.rows.length < 2) return []
  const { sizeX, sizeZ, customAreasPainting, waterMap, placedObjects } = context
  const startsByZone = groupPlayerStartsByZone(context)
  const startOf = (row: PlayerBalanceRow): PlacedObject | undefined => {
    const starts = startsByZone.get(row.zoneId) ?? []
    return starts.find((s) => s.spawnerInfo) ?? starts[0]
  }
  const isDry = (node: number) => (waterMap[node] ?? 0) === 0
  const neighbours = (node: number): number[] => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const out: number[] = []
    if (x > 0) out.push(node - 1)
    if (x < sizeX - 1) out.push(node + 1)
    if (z > 0) out.push(node - sizeX)
    if (z < sizeZ - 1) out.push(node + sizeX)
    return out
  }

  const suggestions: { gap: number; suggestion: RebalanceSuggestion }[] = []

  // ── Land ────────────────────────────────────────────────────────────────
  const medianLand = median(balance.rows.map((r) => r.landTiles))
  // Tiles already claimed by this plan, so two suggestions never paint the same tile.
  const painted = new Map<number, number>()
  const areaAt = (node: number) => painted.get(node) ?? customAreasPainting[node] ?? 0
  for (const row of balance.rows) {
    const start = startOf(row)
    if (!start || medianLand <= 0) continue
    const delta = Math.round(medianLand - row.landTiles)
    if (Math.abs(delta) / medianLand <= LAND_TOLERANCE) continue
    const distance = (node: number) => Math.hypot((node % sizeX) - start.x, Math.floor(node / sizeX) - start.z)
    const changes: { node: number; zoneId: number }[] = []

    if (delta > 0) {
      const heap = new Heap(false)
      const queued = new Set<number>()
      const offer = (node: number) => {
        if (queued.has(node) || areaAt(node) !== 0 || !isDry(node)) return
        queued.add(node)
        heap.push(node, distance(node))
      }
      for (let node = 0; node < customAreasPainting.length; node++) {
        if (areaAt(node) === row.zoneId) for (const next of neighbours(node)) offer(next)
      }
      let added = 0
      while (added < delta && heap.size > 0) {
        const node = heap.pop() as number
        changes.push({ node, zoneId: row.zoneId })
        painted.set(node, row.zoneId)
        added++
        for (const next of neighbours(node)) offer(next)
      }
    } else {
      const heap = new Heap(true)
      const queued = new Set<number>()
      const exposed = (node: number) => neighbours(node).some((next) => areaAt(next) !== row.zoneId)
      const offer = (node: number) => {
        if (queued.has(node) || areaAt(node) !== row.zoneId || !isDry(node) || distance(node) < MIN_START_DISTANCE || !exposed(node)) return
        queued.add(node)
        heap.push(node, distance(node))
      }
      for (let node = 0; node < customAreasPainting.length; node++) if (areaAt(node) === row.zoneId) offer(node)
      let removed = 0
      while (removed < -delta && heap.size > 0) {
        const node = heap.pop() as number
        changes.push({ node, zoneId: 0 })
        painted.set(node, 0)
        removed++
        for (const next of neighbours(node)) offer(next)
      }
    }
    if (changes.length === 0) continue
    const now = row.landTiles + (delta > 0 ? changes.length : -changes.length)
    suggestions.push({
      gap: Math.abs(delta) / medianLand,
      suggestion: {
        id: `land-${row.owner}`,
        kind: 'land',
        owner: row.owner,
        text: i18n.t(delta > 0 ? 'validate.rebalance.landGrow' : 'validate.rebalance.landShrink', {
          owner: row.owner, tiles: changes.length, from: row.landTiles, to: now,
        }),
        edits: [{ kind: 'paintZone', changes }],
      },
    })
  }

  // ── Sites ───────────────────────────────────────────────────────────────
  const artifactSids = new Set(catalog ? collectArtifactSids(catalog) : [])
  const isSite = (o: PlacedObject) => o.type === 0 && o.sid !== 'random-squad' && isGuardCandidate(o.sid, artifactSids)
  const medianSites = median(balance.rows.map((r) => r.siteCount))
  const richest = [...balance.rows].sort((a, b) => b.siteCount - a.siteCount)[0]
  // The kinds to add: the pickups in the richest player's area, most common first; failing that its smaller interactables.
  const donorSids = (category: 'resource' | 'interactableCommon'): string[] => {
    const counts = new Map<string, number>()
    for (const o of placedObjects) {
      if (!isSite(o) || customAreasPainting[o.node] !== richest.zoneId || guardCategoryOf(o.sid, artifactSids) !== category) continue
      counts.set(o.sid, (counts.get(o.sid) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([sid]) => sid)
  }
  let sidsToCopy = donorSids('resource')
  if (sidsToCopy.length === 0) sidsToCopy = donorSids('interactableCommon')

  if (sidsToCopy.length > 0 && medianSites > 0) {
    const blocked = buildBlockedTileSet(context, catalog)
    const occupied = new Set(placedObjects.filter((o) => o.type !== 1).map((o) => o.node))
    const taken: number[] = []
    for (const row of balance.rows) {
      const start = startOf(row)
      const need = Math.min(MAX_SITES_PER_PLAYER, Math.round(medianSites - row.siteCount))
      if (!start || need < 1 || (medianSites - row.siteCount) / medianSites <= 0.15) continue
      const rng = createSeededRng(row.owner * 7919 + start.node)
      const candidates: number[] = []
      for (let node = 0; node < customAreasPainting.length; node++) {
        if (areaAt(node) === row.zoneId && isDry(node) && !blocked.has(node) && !occupied.has(node)) candidates.push(node)
      }
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
      }
      const additions: { node: number; sid: string }[] = []
      for (const node of candidates) {
        if (additions.length >= need) break
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        if (Math.hypot(x - start.x, z - start.z) < MIN_START_DISTANCE) continue
        if (taken.some((other) => Math.hypot((other % sizeX) - x, Math.floor(other / sizeX) - z) < MIN_SITE_SPACING)) continue
        const sid = sidsToCopy[additions.length % sidsToCopy.length]
        const solid = objectBlockedCells(sid, x, z, catalog)
        const entrance = objectBlockedCells(sid, x, z, catalog, true)
        const free = (cell: { x: number; z: number }) =>
          cell.x >= 0 && cell.x < sizeX && cell.z >= 0 && cell.z < sizeZ && isDry(cell.z * sizeX + cell.x) && !blocked.has(cell.z * sizeX + cell.x)
        if (!solid.every((c) => free(c) && areaAt(c.z * sizeX + c.x) === row.zoneId) || !entrance.every(free)) continue
        additions.push({ node, sid })
        taken.push(node)
      }
      if (additions.length === 0) continue
      suggestions.push({
        gap: (medianSites - row.siteCount) / medianSites,
        suggestion: {
          id: `sites-${row.owner}`,
          kind: 'sites',
          owner: row.owner,
          text: i18n.t('validate.rebalance.sitesAdd', {
            owner: row.owner, count: additions.length, from: row.siteCount, to: row.siteCount + additions.length,
            kinds: [...new Set(additions.map((a) => a.sid))].join(', '),
          }),
          edits: [{ kind: 'paintObjects', additions, deletions: [] }],
        },
      })
    }
  }

  return suggestions.sort((a, b) => b.gap - a.gap).map((s) => s.suggestion)
}
