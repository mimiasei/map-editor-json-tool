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
import { Settings2 } from '@/components/ui/icons'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { readMapSettings, type MapSettingsPatch } from '@/lib/map-write'
import { useTranslation } from 'react-i18next'

// Labels live in en.json under mapGrid.mapGameSettingsDialog.fields.<key>.label.
const BOOLEAN_FIELDS = [
  'isTournamentRules',
  'enableHeroHireBan',
  'enableCustomHeroMaxLevel',
  'disableWeekEffect',
  'disableFactionLaws',
  'disableMagicGuild',
  'disableMagicCustomLearning',
  'disableAutoBattleAgainstEnemyHeroes',
  'cantRewriteTurnMode',
  'enableCustomAI',
] as const satisfies readonly (keyof Omit<MapSettingsPatch, 'title' | 'desc'>)[]

export default function MapGameSettingsDialog() {
  const { t } = useTranslation()
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
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title={t('mapGrid.mapGameSettingsDialog.mapSettings')} data-nodrag>
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 max-h-[min(80vh,var(--radix-popover-content-available-height))] overflow-y-auto" data-nodrag>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('mapGrid.mapGameSettingsDialog.mapSettings2')}</p>

        <div className="space-y-1.5">
          <Label htmlFor="map-settings-title" className="text-xs">{t('mapGrid.mapGameSettingsDialog.title')}</Label>
          <Input
            id="map-settings-title"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={() => { if (titleInput !== current.title) commit({ title: titleInput }) }}
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="map-settings-desc" className="text-xs">{t('mapGrid.mapGameSettingsDialog.description')}</Label>
          <Textarea
            id="map-settings-desc"
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
            onBlur={() => { if (descInput !== current.desc) commit({ desc: descInput }) }}
            className="text-xs min-h-16 resize-y"
          />
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          {BOOLEAN_FIELDS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor={`map-settings-${key}`} className="text-xs cursor-pointer">{t(`mapGrid.mapGameSettingsDialog.fields.${key}.label`)}</Label>
                {key === 'isTournamentRules' && <p className="text-[11px] text-muted-foreground">{t('mapGrid.mapGameSettingsDialog.fields.isTournamentRules.hint')}</p>}
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
