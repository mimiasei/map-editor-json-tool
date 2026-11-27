// ─── Map Grid — real .map Settings dialog ───────────────────────────────────
// Exposes Block 1's real `title`/`desc` (the map's actual in-game name/description — NOT the same as the sidebar's own `mapName` field, which
// is scenario-JSON state used only for SID-prefix/export naming), every real, understood boolean Block 2 `settings` field (see map-write.ts's
// `MapSettingsPatch`/`readMapSettings`), and the map's win conditions (`settings.mapWinConditions` plus the City Hold city). Three tabs keep
// it from becoming one long list: General, Rules and Win conditions.
//
// Everything commits immediately, matching this Map Grid's standing "no staging buffer" convention (issue #195): every other interactive
// edit here applies straight to the in-memory document. Title/description use local input state that commits on blur, the same
// "transient keystroke state, not a staged pending edit" pattern, so typing does not spam the undo history.

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import ToolButton from '@/components/map-grid/ToolButton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import WinConditionsEditor from '@/components/common/WinConditionsEditor'
import { Map as MapIcon } from '@/components/ui/icons'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { readMapSettings, readWinConditionData, type MapSettingsPatch } from '@/lib/map-write'
import { readWinState, type WinConditionId, type WinOptions } from '@/lib/rmg/win-conditions'
import { cn } from '@/lib/utils'
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

const TABS = ['general', 'rules', 'win'] as const
type Tab = (typeof TABS)[number]

export default function MapGameSettingsDialog() {
  const { t } = useTranslation()
  const container = useMapDocumentStore((s) => s.container)
  const applyEdit = useMapDocumentStore((s) => s.applyEdit)
  const placedObjects = useMapContextStore((s) => s.context?.placedObjects)
  const mapSizeX = useMapContextStore((s) => s.context?.sizeX ?? 0)
  const mapSizeZ = useMapContextStore((s) => s.context?.sizeZ ?? 0)

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('general')

  const current = container ? readMapSettings(container.chunks[0], container.chunks[1]) : null
  const win = useMemo(() => {
    if (!container) return null
    const { entries, cityHoldId } = readWinConditionData(container.chunks[1])
    return { ...readWinState(entries), cityHoldId }
  }, [container])

  // The neutral cities City Hold can mark: every placed city that is not a player start.
  const cities = useMemo(
    () => (placedObjects ?? []).filter((o) => o.type === 0 && o.isCity && !o.spawnerInfo),
    [placedObjects],
  )

  const [titleInput, setTitleInput] = useState('')
  const [descInput, setDescInput] = useState('')
  useEffect(() => {
    setTitleInput(current?.title ?? '')
    setDescInput(current?.desc ?? '')
    // Only re-sync from the document when its identity actually changes (load/undo/redo/an edit from elsewhere), not on every render, so a
    // mid-edit keystroke here is never clobbered by this same commit's own re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container])

  if (!current || !win) return null

  const commit = (patch: MapSettingsPatch) => {
    try {
      applyEdit({ kind: 'setMapSettings', patch })
    } catch (e) {
      console.error('Failed to apply map settings edit', e)
    }
  }

  const commitWin = (active: WinConditionId[], options: WinOptions, cityHoldId: number | null) => {
    try {
      applyEdit({ kind: 'setWinConditions', active, options, cityHoldId })
    } catch (e) {
      console.error('Failed to apply win conditions edit', e)
    }
  }

  // The city nearest the middle of the map, like the generator's pick.
  const centreCity = (): number | null => {
    let best: number | null = null
    let bestDist = Infinity
    for (const c of cities) {
      const dist = Math.hypot(c.x - mapSizeX / 2, c.z - mapSizeZ / 2)
      if (dist < bestDist) { bestDist = dist; best = c.id }
    }
    return best
  }
  const heldCity = win.cityHoldId !== null && cities.some((c) => c.id === win.cityHoldId) ? win.cityHoldId : null

  const onActiveChange = (next: WinConditionId[]) => {
    commitWin(next, win.options, next.includes('city-hold') ? (heldCity ?? centreCity()) : null)
  }

  return (
    <>
      <ToolButton icon={<MapIcon />} label={t('mapGrid.mapGameSettingsDialog.mapSettings')} onClick={() => setOpen(true)} data-nodrag />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[58rem] max-w-[calc(100vw-2rem)]" onInteractOutside={(e) => e.preventDefault()} data-nodrag>
          <DialogHeader>
            <DialogTitle>{t('mapGrid.mapGameSettingsDialog.mapSettings2')}</DialogTitle>
            <DialogDescription className="sr-only">{t('mapGrid.mapGameSettingsDialog.mapSettings2')}</DialogDescription>
          </DialogHeader>

          {/* A fixed height, so the dialog keeps its size from tab to tab; only the panel scrolls, and only vertically. */}
          <div className="flex h-[min(26rem,calc(100vh-14rem))] flex-col gap-4 sm:flex-row">
            <div role="tablist" aria-orientation="vertical" className="flex shrink-0 gap-1 sm:w-48 sm:flex-col">
              {TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  data-no-tab-marker
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    tab === id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  {t(`mapGrid.mapGameSettingsDialog.tabs.${id}`)}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-2">
              {tab === 'general' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="map-settings-title" className="text-xs">{t('mapGrid.mapGameSettingsDialog.title')}</Label>
                    <Input
                      id="map-settings-title"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      onBlur={() => { if (titleInput !== current.title) commit({ title: titleInput }) }}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="map-settings-desc" className="text-xs">{t('mapGrid.mapGameSettingsDialog.description')}</Label>
                    <Textarea
                      id="map-settings-desc"
                      value={descInput}
                      onChange={(e) => setDescInput(e.target.value)}
                      onBlur={() => { if (descInput !== current.desc) commit({ desc: descInput }) }}
                      className="min-h-40 resize-y text-sm"
                    />
                  </div>
                </div>
              )}

              {tab === 'rules' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {BOOLEAN_FIELDS.map((key) => (
                    <div key={key} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div className="min-w-0">
                        <Label htmlFor={`map-settings-${key}`} className="cursor-pointer text-xs">{t(`mapGrid.mapGameSettingsDialog.fields.${key}.label`)}</Label>
                        {key === 'isTournamentRules' && <p className="mt-0.5 text-[11px] text-muted-foreground">{t('mapGrid.mapGameSettingsDialog.fields.isTournamentRules.hint')}</p>}
                      </div>
                      <Switch id={`map-settings-${key}`} checked={current[key]} onCheckedChange={(v) => commit({ [key]: v })} />
                    </div>
                  ))}
                </div>
              )}

              {tab === 'win' && (
                <WinConditionsEditor
                  active={win.active}
                  options={win.options}
                  onActiveChange={onActiveChange}
                  onOptionsChange={(patch) => commitWin(win.active, { ...win.options, ...patch }, win.active.includes('city-hold') ? heldCity : null)}
                  idPrefix="map-win"
                  description={t('mapGrid.mapGameSettingsDialog.winDescription')}
                  unavailable={cities.length === 0 ? { 'city-hold': t('mapGrid.mapGameSettingsDialog.noNeutralCity') } : undefined}
                  cityHoldExtra={(
                    <div className="space-y-1">
                      <Label className="text-xs">{t('mapGrid.mapGameSettingsDialog.cityToHold')}</Label>
                      <Select
                        value={heldCity === null ? undefined : String(heldCity)}
                        onValueChange={(v) => commitWin(win.active, win.options, Number(v))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('mapGrid.mapGameSettingsDialog.noNeutralCity')} /></SelectTrigger>
                        <SelectContent>
                          {cities.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                              {t('mapGrid.mapGameSettingsDialog.cityOption', { sid: c.sid, x: c.x, z: c.z })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
