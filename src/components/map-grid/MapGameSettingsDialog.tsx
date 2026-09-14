// ─── Map Grid — real .map Settings popover (issue #210 follow-up) ──────────
// Exposes Block 1's real `title`/`desc` (the map's actual in-game name/
// description — NOT the same as the sidebar's own `mapName` field, which is
// scenario-JSON state used only for SID-prefix/export naming) and every real,
// understood boolean Block 2 `settings` field (see map-write.ts's own
// `MapSettingsPatch`/`readMapSettings` doc comment for exactly which ones and
// why `mapWinConditions`/`startSettings.*` are deliberately excluded).
//
// Booleans commit immediately on toggle, matching this Map Grid's own
// standing "no staging buffer" convention (issue #195) — every other
// interactive edit here applies straight to the in-memory document. Title/
// description use local input state that commits on blur, the same
// "transient keystroke state, not a staged pending edit" pattern this
// avoids spamming the undo history on every keystroke without introducing a
// separate "Save" button.

import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Settings2 } from 'lucide-react'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { readMapSettings, type MapSettingsPatch } from '@/lib/map-write'

const BOOLEAN_FIELDS: { key: keyof Omit<MapSettingsPatch, 'title' | 'desc'>; label: string; hint?: string }[] = [
  { key: 'isTournamentRules', label: 'Tournament rules', hint: 'Gates whether a captured Game Zone opens for flight/teleport once its guard is defeated.' },
  { key: 'enableHeroHireBan', label: 'Hero hire ban' },
  { key: 'enableCustomHeroMaxLevel', label: 'Custom hero max level' },
  { key: 'disableWeekEffect', label: 'Disable week effect' },
  { key: 'disableFactionLaws', label: 'Disable faction laws' },
  { key: 'disableMagicGuild', label: 'Disable Magic Guild' },
  { key: 'disableMagicCustomLearning', label: 'Disable custom magic learning' },
  { key: 'disableAutoBattleAgainstEnemyHeroes', label: 'Disable auto-battle vs. enemy heroes' },
  { key: 'cantRewriteTurnMode', label: "Can't rewrite turn mode" },
  { key: 'enableCustomAI', label: 'Custom AI' },
]

export default function MapGameSettingsDialog() {
  const container = useMapDocumentStore((s) => s.container)
  const applyEdit = useMapDocumentStore((s) => s.applyEdit)

  const current = container ? readMapSettings(container.chunks[0], container.chunks[1]) : null

  const [titleInput, setTitleInput] = useState('')
  const [descInput, setDescInput] = useState('')
  useEffect(() => {
    setTitleInput(current?.title ?? '')
    setDescInput(current?.desc ?? '')
    // Only re-sync from the document when its identity actually changes
    // (load/undo/redo/an edit from elsewhere) — not on every render, so a
    // mid-edit keystroke here is never clobbered by this same commit's own
    // re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container])

  if (!current) return null

  const commit = (patch: MapSettingsPatch) => {
    try {
      applyEdit({ kind: 'setMapSettings', patch })
    } catch (e) {
      console.error('Failed to apply map settings edit', e)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Map settings" data-nodrag>
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 max-h-[min(80vh,var(--radix-popover-content-available-height))] overflow-y-auto" data-nodrag>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Map Settings</p>

        <div className="space-y-1.5">
          <Label htmlFor="map-settings-title" className="text-xs">Title</Label>
          <Input
            id="map-settings-title"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={() => { if (titleInput !== current.title) commit({ title: titleInput }) }}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="map-settings-desc" className="text-xs">Description</Label>
          <Textarea
            id="map-settings-desc"
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
            onBlur={() => { if (descInput !== current.desc) commit({ desc: descInput }) }}
            className="text-xs min-h-16 resize-y"
          />
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          {BOOLEAN_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor={`map-settings-${key}`} className="text-xs cursor-pointer">{label}</Label>
                {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
              </div>
              <Switch
                id={`map-settings-${key}`}
                checked={current[key]}
                onCheckedChange={(v) => commit({ [key]: v })}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
