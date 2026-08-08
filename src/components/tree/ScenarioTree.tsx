import { useState, useMemo, useEffect } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { DEBUG } from '@/lib/debug'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Hash,
  Zap,
  BookOpen,
  List,
  Layers,
  MessageSquare,
  MapPin,
  Check,
  Map as MapIcon,
  ClipboardCopy,
  ClipboardPaste,
  PenLine,
  Tag,
} from 'lucide-react'
import { isTauri } from '@/lib/native-fs'
import { copyToClipboard, useClipboardHasPayload } from '@/lib/clipboard'
import type { SubQuest, Trigger } from '@/types/scenario'
import type { MapEntity } from '@/types/map-context'
import { buildEntityUsageMap, describeEntityUsage, type EntityUsage } from '@/lib/entity-usage'
import RenameEntitySidDialog from '@/components/tree/RenameEntitySidDialog'
import SetDisplayNameDialog from '@/components/tree/SetDisplayNameDialog'

// ─── Label width ────────────────────────────────────────────────────────────────
const LABEL_WIDTH_RATIO = 175 / 280

// ─── Shared action buttons (absolute right-0, revealed on group hover) ─────────
function RowActions({
  onCopy,
  onDuplicate,
  onDelete,
}: {
  /** Copies the item to the system clipboard as JSON — distinct from onDuplicate, which
   *  inserts an in-app copy immediately. Tauri only. */
  onCopy?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  if (!onCopy && !onDuplicate && !onDelete) return null
  return (
    <span className="absolute right-0 flex items-center opacity-0 group-hover:opacity-100">
      {onCopy && isTauri() && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onCopy()
          }}
          title="Copy to clipboard"
        >
          <ClipboardCopy className="h-3 w-3" />
        </Button>
      )}
      {onDuplicate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title="Duplicate"
        >
          <Copy className="h-3 w-3" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </span>
  )
}

// ─── Tree node button ───────────────────────────────────────────────────────────
function TreeItem({
  label,
  labelStyle,
  depth = 0,
  selected = false,
  onClick,
  onCopy,
  onDuplicate,
  onDelete,
  icon,
  muted = false,
}: {
  label: string
  labelStyle: React.CSSProperties
  depth?: number
  selected?: boolean
  onClick?: () => void
  onCopy?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  icon?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-1 rounded px-1 py-0.5 text-sm cursor-pointer select-none transition-shadow duration-150',
        selected
          ? 'bg-primary/20 text-primary'
          : 'hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]',
        muted && 'text-muted-foreground',
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={onClick}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <span className="truncate" style={labelStyle}>{label || '(unnamed)'}</span>
      <RowActions onCopy={onCopy} onDuplicate={onDuplicate} onDelete={onDelete} />
    </div>
  )
}

// ─── Section header (Gendizer-style: sticky, uppercase, 36px min-height) ───────
function SectionHeader({
  label,
  count,
  open,
  onToggle,
  onAdd,
  icon,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  onAdd: () => void
  icon?: React.ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="sticky top-0 z-10 flex items-center justify-between min-h-[36px] px-3 border-b border-border/60 bg-[var(--column-left)] dark:bg-card cursor-pointer select-none transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        {label}
        <span className="ml-0.5 font-normal normal-case tracking-normal text-muted-foreground">
          ({count})
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 text-muted-foreground hover:text-primary"
        onClick={(e) => { e.stopPropagation(); onAdd() }}
        title={`Add ${label}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─── Read-only section header (no + button) ─────────────────────────────────
function ReadOnlySectionHeader({
  label,
  count,
  open,
  onToggle,
  icon,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  icon?: React.ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="sticky top-0 z-10 flex items-center min-h-[36px] px-3 border-b border-border/60 bg-[var(--column-left)] dark:bg-card cursor-pointer select-none transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        {label}
        <span className="ml-0.5 font-normal normal-case tracking-normal text-muted-foreground">
          ({count})
        </span>
      </span>
    </div>
  )
}

// ─── Inline copy button ───────────────────────────────────────────────────────
function CopySidButton({ sid }: { sid: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy "${sid}"`}
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(sid).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied
        ? <Check className="h-3 w-3 text-green-500" />
        : <Copy className="h-3 w-3" />}
    </button>
  )
}

// ─── Label for entity type number ────────────────────────────────────────────
function entityTypeLabel(type: unknown): string {
  if (type === 0 || type === '0') return 'Objects'
  if (type === 1 || type === '1') return 'Zones'
  return String(type)
}

// ─── Main tree ──────────────────────────────────────────────────────────────────
export default function ScenarioTree() {
  const {
    scenario,
    selectedType,
    selectedPath,
    setSelection,
    sidebarWidth,
    dialogs,
    mapName,
    setMapName,
    mapFilePath,
    localization,
    addCounter,
    removeCounter,
    duplicateCounter,
    addInterruption,
    removeInterruption,
    duplicateInterruption,
    addQuest,
    removeQuest,
    duplicateQuest,
    addSubQuest,
    removeSubQuest,
    duplicateSubQuest,
    addTrigger,
    removeTrigger,
    duplicateTrigger,
    openDialogEditor,
    removeDialogFlow,
  } = useScenarioStore()

  const entities = useMapContextStore((s) => s.context?.entities) ?? []
  const mapLoaded = useMapContextStore((s) => s.context !== null)

  // One check each, not one per row — the same clipboard content applies no matter which
  // quest/subquest is showing "Add Trigger"/"Add SubQuest" at any given moment.
  const pasteableTrigger = useClipboardHasPayload<Trigger>('trigger')
  const pasteableSubQuest = useClipboardHasPayload<SubQuest>('subquest')

  // Map of entitySid → every usage location in the scenario. Used both for
  // the existing "bold + navigate to first usage" behaviour and
  // (entityUsageListMap) for the rename dialog's full reference warning.
  // Shared with the Map Grid's tile editor (issue #122) via entity-usage.ts.
  const entityUsageListMap = useMemo<Map<string, EntityUsage[]>>(
    () => buildEntityUsageMap(scenario),
    [scenario],
  )

  const entityUsageMap = useMemo<Map<string, EntityUsage>>(() => {
    const map = new Map<string, EntityUsage>()
    for (const [sid, usages] of entityUsageListMap) map.set(sid, usages[0])
    return map
  }, [entityUsageListMap])

  // Group entities by type, sorted by type key then by SID within each group.
  // Spawner heroes get their own group rather than landing in "Objects", so it
  // stays obvious which SIDs came from a spawner (issue #96). Alphabetical group
  // ordering puts Heroes ahead of Objects and Zones.
  //
  // Carries the full MapEntity (not just the SID) so the rename affordance
  // has access to `id`/`source` — `source === 'heroSpawner'` must stay
  // unrenameable, see map-context.ts:36.
  const entityGroups = useMemo(() => {
    const map = new Map<string, MapEntity[]>()
    for (const e of entities) {
      const key = e.source === 'heroSpawner' ? 'Heroes' : entityTypeLabel(e.type)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    for (const es of map.values()) es.sort((a, b) => a.sid.localeCompare(b.sid))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [entities])

  // Lookup map: SID → coords string, for tooltips
  const entityCoordsMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities) {
      if (e.x !== undefined && e.z !== undefined) {
        map.set(e.sid, `Map Coords: ${e.x}, ${e.z}`)
      }
    }
    return map
  }, [entities])

  // Lookup map: SID → readable name. Spawner heroes prefer a custom display
  // name once the map author sets one (issue #133 — same propsName field
  // every other object uses, since heroes have no dedicated name table),
  // falling back to the hero catalog's own name (without Core.zip loaded
  // this half stays empty, matching how every other catalog-backed control
  // degrades); other entities show their propsName-derived displayName, if
  // the map author set one (issue #120).
  const catalogHeroes = useCatalogStore((s) => s.catalog?.heroes)
  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>()
    const heroNames = catalogHeroes ? new Map(catalogHeroes.map((h) => [h.id, h.name])) : null
    for (const e of entities) {
      if (e.source === 'heroSpawner') {
        const custom = e.displayName && e.displayName !== e.sid ? e.displayName : undefined
        const catalogName = heroNames?.get(e.sid)
        const name = custom ?? (catalogName && catalogName !== e.sid ? catalogName : undefined)
        if (name) map.set(e.sid, name)
      } else if (e.displayName && e.displayName !== e.sid) {
        map.set(e.sid, e.displayName)
      }
    }
    return map
  }, [entities, catalogHeroes])

  useEffect(() => {
    if (DEBUG.entitySids) {
      console.log('[ScenarioTree] entities from store:', entities)
    }
  }, [entities])

  const [openSections, setOpenSections] = useState({
    mapSettings: true,
    counters: true,
    interruptions: true,
    quests: true,
    dialogs: true,
    entitySids: true,
  })
  const [openQuests, setOpenQuests] = useState<Record<number, boolean>>({})
  const [openSubQuests, setOpenSubQuests] = useState<Record<string, boolean>>({})

  // Navigate to the usage of an entity SID: expand tree nodes + select the item.
  const navigateToUsage = (usage: { type: 'trigger'; path: [number, number, number] } | { type: 'interruption'; path: [number] }) => {
    if (usage.type === 'trigger') {
      const [qi, sqi, ti] = usage.path
      setOpenSections(s => ({ ...s, quests: true }))
      setOpenQuests(s => ({ ...s, [qi]: true }))
      setOpenSubQuests(s => ({ ...s, [`${qi}-${sqi}`]: true }))
      setSelection('trigger', [qi, sqi, ti])
    } else {
      setOpenSections(s => ({ ...s, interruptions: true }))
      setSelection('interruption', usage.path)
    }
  }

  const [openEntityGroups, setOpenEntityGroups] = useState<Record<string, boolean>>({})
  const [renameTarget, setRenameTarget] = useState<MapEntity | null>(null)
  const [displayNameTarget, setDisplayNameTarget] = useState<MapEntity | null>(null)

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }))

  const toggleQuest = (i: number) =>
    setOpenQuests((s) => ({ ...s, [i]: !s[i] }))

  const toggleSubQuest = (qi: number, sqi: number) =>
    setOpenSubQuests((s) => ({ ...s, [`${qi}-${sqi}`]: !s[`${qi}-${sqi}`] }))

  const isSelected = (type: string, ...path: number[]) =>
    selectedType === type && path.every((v, i) => selectedPath[i] === v)

  const labelStyle = { maxWidth: `${Math.round(sidebarWidth * LABEL_WIDTH_RATIO)}px` }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="pb-4">

        {/* ── Map Settings ── */}
        <div
          role="button"
          tabIndex={0}
          className="sticky top-0 z-10 flex items-center min-h-[36px] px-3 border-b border-border/60 bg-[var(--column-left)] dark:bg-card cursor-pointer select-none transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => toggleSection('mapSettings')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('mapSettings') } }}
        >
          <span className="flex flex-1 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
            {openSections.mapSettings
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="shrink-0 text-muted-foreground"><MapIcon className="h-3 w-3" /></span>
            Map Settings
          </span>
        </div>
        {openSections.mapSettings && (
          <div className="px-3 py-2 space-y-1">
            <Input
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              placeholder="Map name…"
              className="h-7 text-xs"
            />
            {mapName && (
              <p className="text-xs text-muted-foreground font-mono truncate px-0.5">
                {mapName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_
              </p>
            )}
          </div>
        )}

        {/* ── Counters ── */}
        <SectionHeader
          label="Counters"
          count={scenario.counters.length}
          open={openSections.counters}
          onToggle={() => toggleSection('counters')}
          onAdd={addCounter}
          icon={<Hash className="h-3 w-3" />}
        />
        {openSections.counters && (
          <div className="px-1 py-1">
            {scenario.counters.map((counter, i) => (
              <TreeItem
                key={i}
                label={counter.sid}
                labelStyle={labelStyle}
                depth={1}
                selected={isSelected('counter', i)}
                onClick={() => setSelection('counter', [i])}
                onDuplicate={() => duplicateCounter(i)}
                onDelete={() => removeCounter(i)}
                icon={<Hash className="h-3 w-3" />}
              />
            ))}
          </div>
        )}

        {/* ── Interruptions ── */}
        <SectionHeader
          label="Interruptions"
          count={scenario.interruptions.length}
          open={openSections.interruptions}
          onToggle={() => toggleSection('interruptions')}
          onAdd={addInterruption}
          icon={<Zap className="h-3 w-3" />}
        />
        {openSections.interruptions && (
          <div className="px-1 py-1">
            {scenario.interruptions.map((intr, i) => (
              <TreeItem
                key={i}
                label={intr.sid}
                labelStyle={labelStyle}
                depth={1}
                selected={isSelected('interruption', i)}
                onClick={() => setSelection('interruption', [i])}
                onDuplicate={() => duplicateInterruption(i)}
                onDelete={() => removeInterruption(i)}
                icon={<Zap className="h-3 w-3" />}
              />
            ))}
          </div>
        )}

        {/* ── Quests ── */}
        <SectionHeader
          label="Quests"
          count={scenario.quests.length}
          open={openSections.quests}
          onToggle={() => toggleSection('quests')}
          onAdd={() => {
            const newIdx = scenario.quests.length
            addQuest()
            setOpenQuests((s) => ({ ...s, [newIdx]: true }))
          }}
          icon={<BookOpen className="h-3 w-3" />}
        />
        {openSections.quests && (
          <div className="px-1 py-1">
            {scenario.quests.map((quest, qi) => {
              const questOpen = openQuests[qi] ?? false
              return (
                <div key={qi}>
                  {/* Quest row */}
                  <div
                    className={cn(
                      'group relative flex items-center gap-0.5 rounded px-1 py-0.5 text-sm cursor-pointer select-none transition-shadow duration-150',
                      isSelected('quest', qi)
                        ? 'bg-primary/20 text-primary'
                        : 'hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]',
                    )}
                    style={{ paddingLeft: '22px' }}
                    onClick={() => setSelection('quest', [qi])}
                  >
                    <button
                      className="shrink-0 p-0.5 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleQuest(qi)
                      }}
                    >
                      {questOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="ml-1 truncate" style={labelStyle}>{quest.sid || '(unnamed)'}</span>
                    {quest.main && (
                      <span className="shrink-0 text-xs text-primary/70 mr-1">main</span>
                    )}
                    <RowActions
                      onDuplicate={() => duplicateQuest(qi)}
                      onDelete={() => removeQuest(qi)}
                    />
                  </div>

                  {/* SubQuests */}
                  {questOpen &&
                    quest.subQuests.map((subQuest, sqi) => {
                      const subKey = `${qi}-${sqi}`
                      const subOpen = openSubQuests[subKey] ?? false
                      return (
                        <div key={sqi}>
                          {/* SubQuest row */}
                          <div
                            className={cn(
                              'group relative flex items-center gap-0.5 rounded px-1 py-0.5 text-sm cursor-pointer select-none transition-shadow duration-150',
                              isSelected('subquest', qi, sqi)
                                ? 'bg-primary/20 text-primary'
                                : 'hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]',
                            )}
                            style={{ paddingLeft: '36px' }}
                            onClick={() => setSelection('subquest', [qi, sqi])}
                          >
                            <button
                              className="shrink-0 p-0.5 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSubQuest(qi, sqi)
                              }}
                            >
                              {subOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            <List className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="ml-1 truncate" style={labelStyle}>
                              sq: {subQuest.sid || '(unnamed)'}
                            </span>
                            <RowActions
                              onCopy={() => copyToClipboard('subquest', subQuest)}
                              onDuplicate={() => duplicateSubQuest(qi, sqi)}
                              onDelete={() => removeSubQuest(qi, sqi)}
                            />
                          </div>

                          {/* Triggers */}
                          {subOpen && (
                            <>
                              {subQuest.triggers.map((trigger, ti) => (
                                <TreeItem
                                  key={ti}
                                  label={`Trigger ${ti + 1}`}
                                  labelStyle={labelStyle}
                                  depth={4}
                                  selected={isSelected('trigger', qi, sqi, ti)}
                                  onClick={() => setSelection('trigger', [qi, sqi, ti])}
                                  onCopy={() => copyToClipboard('trigger', trigger)}
                                  onDuplicate={() => duplicateTrigger(qi, sqi, ti)}
                                  onDelete={() => removeTrigger(qi, sqi, ti)}
                                  icon={<Layers className="h-3 w-3" />}
                                />
                              ))}
                              <div
                                className="flex items-center gap-1 rounded py-0.5 text-xs text-muted-foreground cursor-pointer transition-all duration-150 hover:text-primary hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]"
                                style={{ paddingLeft: '64px' }}
                                onClick={() => addTrigger(qi, sqi)}
                              >
                                <Plus className="h-3 w-3" />
                                Add Trigger
                              </div>
                              {pasteableTrigger && (
                                <div
                                  className="flex items-center gap-1 rounded py-0.5 text-xs text-muted-foreground cursor-pointer transition-all duration-150 hover:text-primary hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]"
                                  style={{ paddingLeft: '64px' }}
                                  onClick={() => addTrigger(qi, sqi, pasteableTrigger)}
                                  title="Paste the copied trigger"
                                >
                                  <ClipboardPaste className="h-3 w-3" />
                                  Paste Trigger
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}

                  {/* Add SubQuest */}
                  {questOpen && (
                    <div
                      className="flex items-center gap-1 rounded py-0.5 text-xs text-muted-foreground cursor-pointer transition-all duration-150 hover:text-primary hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]"
                      style={{ paddingLeft: '50px' }}
                      onClick={() => {
                        const newSqi = quest.subQuests.length
                        addSubQuest(qi)
                        setOpenSubQuests((s) => ({ ...s, [`${qi}-${newSqi}`]: true }))
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Add SubQuest
                    </div>
                  )}
                  {questOpen && pasteableSubQuest && (
                    <div
                      className="flex items-center gap-1 rounded py-0.5 text-xs text-muted-foreground cursor-pointer transition-all duration-150 hover:text-primary hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]"
                      style={{ paddingLeft: '50px' }}
                      onClick={() => {
                        const newSqi = quest.subQuests.length
                        addSubQuest(qi, pasteableSubQuest)
                        setOpenSubQuests((s) => ({ ...s, [`${qi}-${newSqi}`]: true }))
                      }}
                      title="Paste the copied subquest"
                    >
                      <ClipboardPaste className="h-3 w-3" />
                      Paste SubQuest
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Dialogs ── */}
        <SectionHeader
          label="Dialogs"
          count={Object.keys(dialogs).length}
          open={openSections.dialogs}
          onToggle={() => toggleSection('dialogs')}
          onAdd={() => openDialogEditor(`dialog_${Date.now()}`)}
          icon={<MessageSquare className="h-3 w-3" />}
        />
        {openSections.dialogs && (
          <div className="px-1 py-1">
            {Object.entries(dialogs).map(([id, flow]) => (
              <div
                key={id}
                className="group relative flex items-center gap-1 rounded px-1 py-0.5 text-sm cursor-pointer select-none transition-shadow duration-150 hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)]"
                style={{ paddingLeft: '22px' }}
                onClick={() => openDialogEditor(id)}
              >
                <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="ml-1 truncate font-mono text-xs" style={labelStyle}>{id}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {flow.slides.length}s
                </span>
                <span className="absolute right-0 flex items-center opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDialogFlow(id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Entity SIDs (from loaded .map file) ── */}
        <>
          <ReadOnlySectionHeader
            label="Entity SIDs"
            count={entities.length}
            open={openSections.entitySids}
            onToggle={() => toggleSection('entitySids')}
            icon={<MapPin className="h-3 w-3" />}
          />
          {openSections.entitySids && (
            <div className="px-1 py-1">
              {!mapLoaded && (
                <p className="text-[10px] text-muted-foreground px-2 py-1 italic">
                  Load a .map file to see named entities.
                </p>
              )}
              {mapLoaded && entities.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-1 italic">
                  No named entities found in this map.
                </p>
              )}
              {entityGroups.map(([groupLabel, groupEntities]) => {
                const groupOpen = openEntityGroups[groupLabel] ?? true
                return (
                  <div key={groupLabel}>
                    {/* Category row */}
                    <div
                      className="flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer select-none text-xs text-muted-foreground hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.55)] transition-shadow duration-150"
                      style={{ paddingLeft: '14px' }}
                      onClick={() =>
                        setOpenEntityGroups((s) => ({ ...s, [groupLabel]: !(s[groupLabel] ?? true) }))
                      }
                    >
                      {groupOpen
                        ? <ChevronDown className="h-3 w-3 shrink-0" />
                        : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span className="ml-1 font-medium">{groupLabel}</span>
                      <span className="ml-1 text-muted-foreground/60">({groupEntities.length})</span>
                    </div>
                    {/* SID rows */}
                    {groupOpen && groupEntities.map((entity) => {
                      const sid = entity.sid
                      const usage = entityUsageMap.get(sid)
                      const coords = entityCoordsMap.get(sid)
                      const name = entityNameMap.get(sid)
                      const titleText = [
                        name,
                        coords,
                        usage ? `Go to ${usage.type} [${usage.path.join(', ')}]` : undefined,
                      ].filter(Boolean).join(' · ')
                      // Hero-spawner SIDs are hero catalog IDs, not authored
                      // entity names — renaming them is out of scope (map-context.ts:36).
                      // Their display name is a separate, safe-to-edit field though
                      // (propsName, same as any other object — issue #133), so only
                      // the rename-SID button stays gated off for heroes.
                      const canRenameSid = isTauri() && entity.source !== 'heroSpawner' && !!mapFilePath
                      const canSetDisplayName = isTauri() && !!mapFilePath
                      return (
                        <div
                          key={sid}
                          className={cn(
                            'group relative flex items-center gap-1 rounded py-0.5 text-xs select-none',
                            usage
                              ? 'text-foreground cursor-pointer hover:bg-accent'
                              : 'text-muted-foreground cursor-default',
                          )}
                          style={{ paddingLeft: '36px' }}
                          onClick={usage ? () => navigateToUsage(usage) : undefined}
                          title={titleText || undefined}
                        >
                          <span
                            className={cn(
                              'truncate font-mono',
                              usage && 'font-bold',
                              name ? 'shrink-0 max-w-[55%]' : 'flex-1',
                            )}
                            style={labelStyle}
                          >
                            {sid}
                          </span>
                          {name && (
                            <span className="truncate flex-1 text-muted-foreground/70">
                              {name}
                            </span>
                          )}
                          {canRenameSid && (
                            <button
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-colors"
                              title={`Rename "${sid}"`}
                              onClick={(e) => { e.stopPropagation(); setRenameTarget(entity) }}
                            >
                              <PenLine className="h-3 w-3" />
                            </button>
                          )}
                          {canSetDisplayName && (
                            <button
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-colors"
                              title={`Set display name for "${sid}"`}
                              onClick={(e) => { e.stopPropagation(); setDisplayNameTarget(entity) }}
                            >
                              <Tag className="h-3 w-3" />
                            </button>
                          )}
                          <CopySidButton sid={sid} />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </>

      </div>

      <RenameEntitySidDialog
        open={renameTarget !== null}
        onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
        entity={renameTarget}
        existingSids={entities.map((e) => e.sid)}
        usageDescriptions={
          renameTarget
            ? (entityUsageListMap.get(renameTarget.sid) ?? []).map(describeEntityUsage)
            : []
        }
        mapFilePath={mapFilePath}
      />

      <SetDisplayNameDialog
        open={displayNameTarget !== null}
        onOpenChange={(open) => { if (!open) setDisplayNameTarget(null) }}
        entity={displayNameTarget}
        existingSids={[...entities.map((e) => e.sid), ...Object.keys(localization)]}
        mapFilePath={mapFilePath}
      />
    </ScrollArea>
  )
}
