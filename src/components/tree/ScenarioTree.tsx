import { useState, useMemo, useEffect } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
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
} from 'lucide-react'

// ─── Label width ────────────────────────────────────────────────────────────────
const LABEL_WIDTH_RATIO = 175 / 280

// ─── Shared action buttons (absolute right-0, revealed on group hover) ─────────
function RowActions({
  onDuplicate,
  onDelete,
}: {
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  if (!onDuplicate && !onDelete) return null
  return (
    <span className="absolute right-0 flex items-center opacity-0 group-hover:opacity-100">
      {onDuplicate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
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
      <RowActions onDuplicate={onDuplicate} onDelete={onDelete} />
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
      className="sticky top-0 z-10 flex items-center justify-between min-h-[36px] px-3 border-b border-border/60 bg-[#e4ffca] dark:bg-card cursor-pointer select-none transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      className="sticky top-0 z-10 flex items-center min-h-[36px] px-3 border-b border-border/60 bg-[#e4ffca] dark:bg-card cursor-pointer select-none transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

  // Build a map of entitySid → first usage location in the scenario so we
  // can make entity SID rows bold and navigable.
  type EntityUsage = { type: 'trigger'; path: [number, number, number] } | { type: 'interruption'; path: [number] }
  const entityUsageMap = useMemo<Map<string, EntityUsage>>(() => {
    const map = new Map<string, EntityUsage>()
    const register = (sid: string, usage: EntityUsage) => { if (!map.has(sid)) map.set(sid, usage) }
    for (const [qi, quest] of scenario.quests.entries()) {
      for (const [sqi, sq] of quest.subQuests.entries()) {
        for (const [ti, trigger] of sq.triggers.entries()) {
          const params = [
            ...trigger.actions.flatMap(a => a.p ?? []),
            ...trigger.conditions.flatMap(c => c.p ?? []),
          ]
          for (const p of params) {
            if (typeof p === 'string' && p) register(p, { type: 'trigger', path: [qi, sqi, ti] })
          }
        }
      }
    }
    for (const [ii, intr] of scenario.interruptions.entries()) {
      for (const p of intr.actions.flatMap(a => a.p ?? [])) {
        if (typeof p === 'string' && p) register(p, { type: 'interruption', path: [ii] })
      }
    }
    return map
  }, [scenario])

  // Group entities by type, sorted by type key then by SID within each group
  const entityGroups = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const e of entities) {
      const key = entityTypeLabel(e.type)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e.sid)
    }
    // Sort SIDs within each group
    for (const sids of map.values()) sids.sort()
    // Return sorted by group name
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [entities])

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
    <ScrollArea className="flex-1">
      <div className="pb-4">

        {/* ── Map Settings ── */}
        <div
          role="button"
          tabIndex={0}
          className="sticky top-0 z-10 flex items-center min-h-[36px] px-3 border-b border-border/60 bg-[#e4ffca] dark:bg-card cursor-pointer select-none transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                              onDuplicate={() => duplicateSubQuest(qi, sqi)}
                              onDelete={() => removeSubQuest(qi, sqi)}
                            />
                          </div>

                          {/* Triggers */}
                          {subOpen && (
                            <>
                              {subQuest.triggers.map((_trigger, ti) => (
                                <TreeItem
                                  key={ti}
                                  label={`Trigger ${ti + 1}`}
                                  labelStyle={labelStyle}
                                  depth={4}
                                  selected={isSelected('trigger', qi, sqi, ti)}
                                  onClick={() => setSelection('trigger', [qi, sqi, ti])}
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
              {entityGroups.map(([groupLabel, sids]) => {
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
                      <span className="ml-1 text-muted-foreground/60">({sids.length})</span>
                    </div>
                    {/* SID rows */}
                    {groupOpen && sids.map((sid) => {
                      const usage = entityUsageMap.get(sid)
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
                          title={usage ? `Go to ${usage.type} [${usage.path.join(', ')}]` : undefined}
                        >
                          <span
                            className={cn('truncate font-mono flex-1', usage && 'font-bold')}
                            style={labelStyle}
                          >
                            {sid}
                          </span>
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
    </ScrollArea>
  )
}
