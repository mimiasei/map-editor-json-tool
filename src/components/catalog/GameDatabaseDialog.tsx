// ─── Game Database Dialog ─────────────────────────────────────────────────────
// Draggable/resizable panel showing all game data from Core.zip, organized by
// tabs. Shows live instance counts (map placements + script references) and
// allows filtering to only placed/used items.

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Copy, Check, Filter } from 'lucide-react'
import type {
  CatalogHero,
  CatalogCreature,
  CatalogArtifact,
  CatalogSpell,
  CatalogSkill,
  CatalogBuff,
  CatalogMapObject,
  CatalogFaction,
} from '@/lib/catalog/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'heroes' | 'creatures' | 'artifacts' | 'spells' | 'skills' | 'mapObjects' | 'buffs' | 'factions'

interface CatalogItem {
  id: string
  name: string
  icon?: string
  subtitle?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'heroes',     label: 'Heroes' },
  { id: 'creatures',  label: 'Creatures' },
  { id: 'artifacts',  label: 'Artifacts' },
  { id: 'spells',     label: 'Spells' },
  { id: 'skills',     label: 'Skills' },
  { id: 'mapObjects', label: 'Map Objects' },
  { id: 'buffs',      label: 'Buffs' },
  { id: 'factions',   label: 'Factions' },
]

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
      title={`Copy "${text}"`}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ─── Detail pane ─────────────────────────────────────────────────────────────

function DetailPane({
  item,
  mapCount,
  scriptCount,
  mapEntities,
}: {
  item: CatalogItem & Record<string, unknown>
  mapCount: number
  scriptCount: number
  mapEntities: { sid: string; type: string }[]
}) {
  const instancesOfType = mapEntities.filter((e) => e.type === item.id)

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto text-sm">
      {/* Icon + name */}
      <div className="flex items-center gap-3">
        <CatalogIcon iconId={item.icon} name={item.name} size={40} />
        <div>
          <p className="font-semibold leading-tight">{item.name}</p>
          {item.subtitle && (
            <p className="text-xs text-muted-foreground">{item.subtitle}</p>
          )}
        </div>
      </div>

      {/* SID */}
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SID</p>
        <div className="flex items-center gap-1.5 font-mono text-xs bg-muted rounded px-2 py-1">
          <span className="flex-1 break-all">{item.id}</span>
          <CopyButton text={item.id} />
        </div>
      </div>

      {/* Instance counts */}
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Usage</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <div className="bg-muted rounded px-2 py-1">
            <span className="text-muted-foreground">Map placements </span>
            <span className="font-semibold">{mapCount}</span>
          </div>
          <div className="bg-muted rounded px-2 py-1">
            <span className="text-muted-foreground">Script refs </span>
            <span className="font-semibold">{scriptCount}</span>
          </div>
        </div>
      </div>

      {/* Extra fields */}
      {Object.entries(item)
        .filter(([k]) => !['id', 'name', 'icon', 'subtitle'].includes(k))
        .map(([k, v]) => {
          if (v === undefined || v === null || v === '') return null
          return (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-muted-foreground capitalize w-20 shrink-0">{k}</span>
              <span className="font-mono break-all">{String(v)}</span>
            </div>
          )
        })}

      {/* Named map instances */}
      {instancesOfType.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Named instances ({instancesOfType.length})
          </p>
          <div className="flex flex-col gap-0.5">
            {instancesOfType.map((e) => (
              <div key={e.sid} className="flex items-center gap-1.5 font-mono text-xs bg-muted rounded px-2 py-0.5">
                <span className="flex-1 break-all">{e.sid}</span>
                <CopyButton text={e.sid} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameDatabaseDialog({ open, onOpenChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const mapEntities = useMapContextStore((s) => s.context?.entities ?? [])
  const scenario = useScenarioStore((s) => s.scenario)

  const [activeTab, setActiveTab] = useState<TabId>('heroes')
  const [search, setSearch] = useState('')
  const [onlyUsed, setOnlyUsed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Build SID frequency maps ────────────────────────────────────────────────

  // Map placement counts: count catalog type SIDs from named map entities
  // (mapEntities[].type is the catalog item ID, e.g. "dragon_utopia")
  const mapCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of mapEntities) {
      if (e.type) counts[e.type] = (counts[e.type] ?? 0) + 1
    }
    return counts
  }, [mapEntities])

  // Script reference counts: traverse quests[*].subQuests[*].triggers[*].actions
  // and interruptions[*].actions, collecting all string params
  const scriptCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const countActions = (actions: { p?: string[] }[]) => {
      for (const action of actions) {
        for (const p of action.p ?? []) {
          if (p) counts[p] = (counts[p] ?? 0) + 1
        }
      }
    }
    for (const quest of scenario.quests) {
      for (const sq of quest.subQuests) {
        for (const trigger of sq.triggers) {
          countActions(trigger.actions)
        }
      }
    }
    for (const interruption of scenario.interruptions) {
      countActions(interruption.actions)
    }
    return counts
  }, [scenario])

  const totalCount = (id: string) => (mapCounts[id] ?? 0) + (scriptCounts[id] ?? 0)

  // ── Build items for the active tab ──────────────────────────────────────────

  const items: CatalogItem[] = useMemo(() => {
    if (!catalog) return []

    switch (activeTab) {
      case 'heroes':
        return catalog.heroes.map((h: CatalogHero) => ({
          ...h,
          subtitle: [h.fraction, h.classType].filter(Boolean).join(' · '),
        }))
      case 'creatures':
        return catalog.creatures.map((c: CatalogCreature) => ({
          ...c,
          subtitle: [c.fraction, c.tier ? `Tier ${c.tier}` : undefined].filter(Boolean).join(' · '),
        }))
      case 'artifacts':
        return catalog.artifacts.map((a: CatalogArtifact) => ({
          ...a,
          subtitle: [a.slot, a.rarity].filter(Boolean).join(' · '),
        }))
      case 'spells':
        return catalog.spells.map((s: CatalogSpell) => ({
          ...s,
          subtitle: [s.school, s.rank ? `Rank ${s.rank}` : undefined].filter(Boolean).join(' · '),
        }))
      case 'skills':
        return catalog.skills.map((s: CatalogSkill) => ({ ...s }))
      case 'mapObjects':
        return catalog.mapObjects.map((o: CatalogMapObject) => ({
          ...o,
          subtitle: [o.category, o.tag].filter(Boolean).join(' · '),
        }))
      case 'buffs':
        return catalog.buffs.map((b: CatalogBuff) => ({ ...b }))
      case 'factions':
        return catalog.factions.map((f: CatalogFaction) => ({ ...f }))
      default:
        return []
    }
  }, [catalog, activeTab])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter((item) => {
      if (onlyUsed && totalCount(item.id) === 0) return false
      if (!q) return true
      return item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, onlyUsed, mapCounts, scriptCounts])

  const selectedItem = useMemo(
    () => (selectedId ? (items.find((i) => i.id === selectedId) ?? null) : null),
    [items, selectedId],
  ) as (CatalogItem & Record<string, unknown>) | null

  // Reset selection when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabId)
    setSelectedId(null)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={860}
        defaultHeight={580}
        minWidth={600}
        minHeight={400}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Game Database</DialogTitle>

        {/* ── Header / drag handle ── */}
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 border-b border-border shrink-0 gap-3">
          <span className="text-sm font-semibold">Game Database</span>

          {/* Tab bar */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1">
            <TabsList className="h-7 gap-0.5">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="h-6 px-2 text-xs">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DraggableDialogDragHandle>

        {/* ── Body ── */}
        {!catalog ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-sm text-muted-foreground p-8">
            <p>Game data not loaded.</p>
            <p className="text-xs">Load Core.zip via the toolbar → More → Game Data.</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* ── List pane ── */}
            <div className="flex flex-col w-64 shrink-0 border-r border-border">
              {/* Search + filter */}
              <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-7 text-xs"
                />
                <Button
                  variant={onlyUsed ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="Only show items placed or referenced on this map"
                  onClick={() => setOnlyUsed((v) => !v)}
                >
                  <Filter className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Item list */}
              <ScrollArea className="flex-1">
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 px-3">
                    {onlyUsed ? 'No items placed or used on this map.' : 'No matches.'}
                  </p>
                )}
                {filtered.map((item) => {
                  const count = totalCount(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                      className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left hover:bg-accent transition-colors ${
                        selectedId === item.id ? 'bg-accent' : ''
                      }`}
                    >
                      <CatalogIcon iconId={item.icon} name={item.name} size={20} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate leading-tight">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">{item.id}</p>
                      </div>
                      {count > 0 && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
                          {count}
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </ScrollArea>

              {/* Footer: item count */}
              <div className="px-2.5 py-1.5 border-t border-border text-[10px] text-muted-foreground">
                {filtered.length} of {items.length} items
                {onlyUsed && ' (filtered)'}
              </div>
            </div>

            {/* ── Detail pane ── */}
            <div className="flex-1 min-w-0">
              {selectedItem ? (
                <DetailPane
                  item={selectedItem}
                  mapCount={mapCounts[selectedItem.id] ?? 0}
                  scriptCount={scriptCounts[selectedItem.id] ?? 0}
                  mapEntities={mapEntities}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Select an item to see details
                </div>
              )}
            </div>
          </div>
        )}
      </DraggableDialogContent>
    </Dialog>
  )
}
