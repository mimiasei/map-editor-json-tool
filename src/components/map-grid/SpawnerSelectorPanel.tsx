// ─── Map Grid — city/hero spawner selector ───────────────────────────────────
// A read-only "jump to spawner" list, following ObjectBrowserPanel's own
// info-column convention: swaps into the cell-info column and lists every
// placed city-spawner/hero-spawner (PlacedObject.spawnerInfo). Clicking a row
// selects that tile (useMapGridStore) and centers the viewport on it without
// changing zoom, via MapGridDialog's own onSelect callback — a quick way to
// find/inspect a player's start position without hunting for it visually on
// a large map.

import { Crown, Landmark, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { factionDisplayName } from '@/lib/factions'
import type { GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'

interface Props {
  spawners: PlacedObject[]
  catalog: GameCatalog | null
  selectedNode: number | null
  onSelect: (item: PlacedObject) => void
  onClose: () => void
}

export default function SpawnerSelectorPanel({ spawners, catalog, selectedNode, onSelect, onClose }: Props) {
  const sorted = [...spawners].sort((a, b) => {
    const ownerDiff = (a.spawnerInfo?.owner ?? 0) - (b.spawnerInfo?.owner ?? 0)
    if (ownerDiff !== 0) return ownerDiff
    return (a.spawnerInfo?.spawnPointType ?? 0) - (b.spawnerInfo?.spawnPointType ?? 0)
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground pl-1">Player Spawners</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {sorted.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No city or hero spawners placed yet.</p>
        )}
        {sorted.map((item) => {
          const isCity = item.sid === 'city-spawner'
          const icon = catalog?.mapObjects.find((o) => o.id === item.sid)?.icon
          const owner = item.spawnerInfo?.owner
          // Faction/spawn-hero/garrison are city-spawner concepts only — a
          // hero-spawner's own hero identity is shown instead (spawnerInfo.
          // heroSid, per map-context.ts: undefined spawnHero for hero rows).
          const factionText = isCity
            ? item.spawnerInfo?.factionSid
              ? factionDisplayName(item.spawnerInfo.factionSid, catalog?.factions)
              : 'Random faction'
            : null
          const spawnHeroText = isCity ? (item.spawnerInfo?.spawnHero ? 'Spawns with hero' : 'No hero') : null
          // No confirmed "garrison total value" field exists for cities
          // (see propRandomSquads.sids doc comment, map-context.ts) — squad
          // count is the closest real, exposed data.
          const garrisonCount = item.citySquadSids?.length ?? 0
          const garrisonText = isCity
            ? garrisonCount > 0
              ? `Garrison: ${garrisonCount} squad${garrisonCount > 1 ? 's' : ''}`
              : 'Garrison: None'
            : null
          const heroSidText = !isCity
            ? item.spawnerInfo?.heroSid && item.spawnerInfo.heroSid !== 'random'
              ? item.spawnerInfo.heroSid
              : 'Random hero'
            : null
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                item.node === selectedNode ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              {icon ? (
                <CatalogIcon iconId={icon} name={item.sid} size={24} />
              ) : isCity ? (
                <Landmark className="h-6 w-6 shrink-0 text-muted-foreground" />
              ) : (
                <Crown className="h-6 w-6 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  Player {owner ?? '?'} — {isCity ? 'City' : 'Hero'} Spawner
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[factionText, spawnHeroText, garrisonText, heroSidText].filter(Boolean).join(' · ')}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
