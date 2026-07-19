import { useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
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
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  onAdd: () => void
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

  const [openSections, setOpenSections] = useState({
    mapSettings: true,
    counters: true,
    interruptions: true,
    quests: true,
    dialogs: true,
  })
  const [openQuests, setOpenQuests] = useState<Record<number, boolean>>({})
  const [openSubQuests, setOpenSubQuests] = useState<Record<string, boolean>>({})

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
          onAdd={addQuest}
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
                      onClick={() => addSubQuest(qi)}
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

      </div>
    </ScrollArea>
  )
}
