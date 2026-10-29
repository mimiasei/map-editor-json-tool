// ─── Real game RMG template — full detail view ───────────────────────────────
// Opened via the "i" button on each row of SelectGameTemplateDialog. Purely
// informational (never feeds generation) — parses with rmg-template-
// details.ts's permissive `parseTemplateDetails`, which surfaces as much of
// the template's own real data as can be shown legibly, not just the
// subset rmg-template-import.ts actually consumes for generation.

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { readBundledGameTemplateJson } from '@/lib/rmg/rmg-template-catalog'
import { parseTemplateDetails, type TemplateDetails, type TemplateZoneDetails } from '@/lib/rmg/rmg-template-details'
import { logError } from '@/lib/logger'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null closes the dialog with nothing to show — matches how every other
   *  "target" prop in this codebase (renameTarget, heroEditorTarget, ...)
   *  doubles as its own open/closed state. */
  fileName: string | null
  displayName: string
}

function fmt(n: number | undefined): string | undefined {
  return n === undefined ? undefined : n.toLocaleString()
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex items-baseline gap-1.5 text-xs">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function ChipList({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((s) => (
          <Badge key={s} variant="outline" className="font-mono font-normal">{s}</Badge>
        ))}
      </div>
    </div>
  )
}

function ZoneCard({ zone }: { zone: TemplateZoneDetails }) {
  const { t } = useTranslation()
  const hasValueBudget = [
    zone.guardedContentValue, zone.guardedContentValuePerArea,
    zone.unguardedContentValue, zone.unguardedContentValuePerArea,
    zone.resourcesValue, zone.resourcesValuePerArea,
  ].some((v) => v !== undefined)
  const hasGuardTuning = [zone.guardCutoffValue, zone.guardMultiplier, zone.guardRandomization, zone.guardWeeklyIncrement].some((v) => v !== undefined)

  return (
    <div className="rounded border border-border p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{zone.name}</span>
        <Badge variant={zone.kind === 'player' ? 'default' : 'secondary'}>
          {zone.kind === 'player' ? `Player ${zone.playerIndex ?? '?'}` : t('common.templateDetailsDialog.neutral')}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <KV label={t('shared.size')} value={zone.size} />
        <KV label={t('shared.layout')} value={zone.layout} />
        <KV label={t('common.templateDetailsDialog.biome')} value={zone.biomeSummary} />
        <KV label={t('shared.roads')} value={zone.roadCount > 0 ? zone.roadCount : undefined} />
      </div>
      {hasGuardTuning && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-border/60">
          <KV label={t('common.templateDetailsDialog.guardCutoff')} value={fmt(zone.guardCutoffValue)} />
          <KV label={t('common.templateDetailsDialog.guardMultiplier')} value={zone.guardMultiplier} />
          <KV label={t('common.templateDetailsDialog.guardRandomization')} value={zone.guardRandomization} />
          <KV label={t('common.templateDetailsDialog.guardWeeklyIncrement')} value={zone.guardWeeklyIncrement} />
        </div>
      )}
      {hasValueBudget && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-border/60">
          <KV label={t('common.templateDetailsDialog.guardedValue')} value={zone.guardedContentValue !== undefined ? `${fmt(zone.guardedContentValue)}${zone.guardedContentValuePerArea ? ` (+${fmt(zone.guardedContentValuePerArea)}/area)` : ''}` : undefined} />
          <KV label={t('common.templateDetailsDialog.unguardedValue')} value={zone.unguardedContentValue !== undefined ? `${fmt(zone.unguardedContentValue)}${zone.unguardedContentValuePerArea ? ` (+${fmt(zone.unguardedContentValuePerArea)}/area)` : ''}` : undefined} />
          <KV label={t('common.templateDetailsDialog.resourcesValue')} value={zone.resourcesValue !== undefined ? `${fmt(zone.resourcesValue)}${zone.resourcesValuePerArea ? ` (+${fmt(zone.resourcesValuePerArea)}/area)` : ''}` : undefined} />
        </div>
      )}
      {(zone.contentCountLimitNames.length > 0 || zone.mandatoryContentNames.length > 0) && (
        <div className="pt-1 border-t border-border/60 space-y-1">
          <KV label={t('common.templateDetailsDialog.contentLimits')} value={zone.contentCountLimitNames.join(', ')} />
          <KV label={t('common.templateDetailsDialog.mandatoryContent')} value={zone.mandatoryContentNames.join(', ')} />
        </div>
      )}
      {zone.mainObjects.length > 0 && (
        <div className="pt-1 border-t border-border/60 space-y-1">
          <p className="text-xs text-muted-foreground">{t('common.templateDetailsDialog.mainObjects')}</p>
          {zone.mainObjects.map((mo, i) => (
            <div key={i} className="text-xs pl-2 border-l-2 border-border space-y-0.5 py-0.5">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-medium">{mo.type}</span>
                {mo.spawn && <span className="text-muted-foreground">({mo.spawn})</span>}
                {mo.placement && <span className="text-muted-foreground">{t('common.templateDetailsDialog.placement', { value: `${mo.placement}${mo.placementArgs?.length ? ` [${mo.placementArgs.join(', ')}]` : ''}` })}</span>}
                {mo.guardChance !== undefined && <span className="text-muted-foreground">{t('common.templateDetailsDialog.guardChance', { guardChance: mo.guardChance })}</span>}
                {mo.guardValue !== undefined && <span className="text-muted-foreground">{t('common.templateDetailsDialog.guardValue', { value: fmt(mo.guardValue) })}</span>}
                {mo.isKeyObject && <Badge variant="outline" className="text-[10px] py-0">{t('common.templateDetailsDialog.keyObject')}</Badge>}
              </div>
              {mo.factionSummary && <p className="text-muted-foreground">{mo.factionSummary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TemplateDetailsDialog({ open, onOpenChange, fileName, displayName }: Props) {
  const { t } = useTranslation()
  const [details, setDetails] = useState<TemplateDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [variantIndex, setVariantIndex] = useState(0)

  useEffect(() => {
    if (!open || !fileName) { setDetails(null); setError(null); return }
    setDetails(null)
    setError(null)
    setVariantIndex(0)
    void readBundledGameTemplateJson(fileName).then((json) => {
      if (!json) throw new Error(t('common.selectGameTemplateDialog.readFailed'))
      setDetails(parseTemplateDetails(json))
    }).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      logError(`Failed to load template details for "${fileName}": ${msg}`)
    })
  }, [open, fileName])

  const variant = details?.variants[variantIndex]
  const hasGameRulesData = details && [
    details.gameRules.heroCountMin, details.gameRules.heroCountMax, details.gameRules.heroCountIncrement,
    details.gameRules.heroHireBan, details.gameRules.encounterHoles,
    details.gameRules.factionLawsExpModifier, details.gameRules.astrologyExpModifier,
  ].some((v) => v !== undefined) || (details?.gameRules.winConditions && Object.keys(details.gameRules.winConditions).length > 0)

  const winConditionRows = useMemo(
    () => details?.gameRules.winConditions ? Object.entries(details.gameRules.winConditions) : [],
    [details],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={720} defaultHeight={680} minWidth={480} minHeight={400} storageKey="rmg-template-details">
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">{displayName}</DialogTitle>
        </DraggableDialogDragHandle>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && <p className="text-xs text-destructive text-center py-4">{error}</p>}
          {!error && !details && <p className="text-xs text-muted-foreground text-center py-4">{t('shared.loading')}</p>}

          {details && (
            <>
              <Section title={t('common.templateDetailsDialog.overview')}>
                <div className="flex flex-wrap gap-1.5">
                  {details.gameMode && <Badge variant="secondary">{details.gameMode}</Badge>}
                  {details.displayWinCondition && <Badge variant="outline" className="font-mono font-normal">{details.displayWinCondition}</Badge>}
                  {details.declaredSizeX && details.declaredSizeZ && (
                    <Badge variant="outline">{t('common.templateDetailsDialog.asDesigned', { declaredSizeX: details.declaredSizeX, declaredSizeZ: details.declaredSizeZ })}</Badge>
                  )}
                  <Badge variant="outline">{t('common.templateDetailsDialog.variants', { count: details.variants.length })}</Badge>
                </div>
              </Section>

              {hasGameRulesData && (
                <Section title={t('common.templateDetailsDialog.gameRules')}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <KV label={t('common.templateDetailsDialog.heroes')} value={
                      details.gameRules.heroCountMin !== undefined || details.gameRules.heroCountMax !== undefined
                        ? `${details.gameRules.heroCountMin ?? '?'}–${details.gameRules.heroCountMax ?? '?'}${details.gameRules.heroCountIncrement ? ` (+${details.gameRules.heroCountIncrement}/week)` : ''}`
                        : undefined
                    } />
                    <KV label={t('common.templateDetailsDialog.heroHireBan')} value={details.gameRules.heroHireBan !== undefined ? (details.gameRules.heroHireBan ? 'Yes' : 'No') : undefined} />
                    <KV label={t('common.templateDetailsDialog.encounterHoles')} value={details.gameRules.encounterHoles !== undefined ? (details.gameRules.encounterHoles ? 'Yes' : 'No') : undefined} />
                    <KV label={t('common.templateDetailsDialog.factionLawsExp')} value={details.gameRules.factionLawsExpModifier} />
                    <KV label={t('common.templateDetailsDialog.astrologyExp')} value={details.gameRules.astrologyExpModifier} />
                  </div>
                  {winConditionRows.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5 mt-1.5 border-t border-border/60">
                      {winConditionRows.map(([k, v]) => (
                        <KV key={k} label={k} value={typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)} />
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {details.globalBans && (details.globalBans.items?.length || details.globalBans.magics?.length || details.globalBans.heroes?.length) ? (
                <Section title={t('common.templateDetailsDialog.globalBans')}>
                  <div className="space-y-1.5">
                    <ChipList label={t('common.templateDetailsDialog.items')} items={details.globalBans.items} />
                    <ChipList label={t('common.templateDetailsDialog.magics')} items={details.globalBans.magics} />
                    <ChipList label={t('common.templateDetailsDialog.heroes')} items={details.globalBans.heroes} />
                  </div>
                </Section>
              ) : null}

              {details.valueOverrides.length > 0 && (
                <Section title={t('common.templateDetailsDialog.valueOverrides')}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {details.valueOverrides.map((v, i) => (
                      <KV key={i} label={v.sid} value={fmt(v.guardValue)} />
                    ))}
                  </div>
                </Section>
              )}

              {details.zoneLayouts.length > 0 && (
                <Section title={t('common.templateDetailsDialog.zoneLayouts')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {details.zoneLayouts.map((zl) => (
                      <div key={zl.name} className="rounded border border-border p-2 space-y-0.5">
                        <p className="text-xs font-medium">{zl.name}</p>
                        <KV label={t('common.templateDetailsDialog.obstacles')} value={zl.obstaclesFill} />
                        <KV label={t('common.templateDetailsDialog.lakes')} value={zl.lakesFill} />
                        <KV label={t('common.templateDetailsDialog.minLakeArea')} value={zl.minLakeArea} />
                        <KV label={t('common.templateDetailsDialog.roadClusterArea')} value={zl.roadClusterArea} />
                        <KV label={t('common.templateDetailsDialog.elevationClusterScale')} value={zl.elevationClusterScale} />
                        {zl.ambientPickupDistribution && (
                          <KV
                            label={t('common.templateDetailsDialog.ambientPickups')}
                            value={`repulsion ${zl.ambientPickupDistribution.repulsion ?? '?'}, noise ${zl.ambientPickupDistribution.noise ?? '?'}, road attr. ${zl.ambientPickupDistribution.roadAttraction ?? '?'}, obstacle attr. ${zl.ambientPickupDistribution.obstacleAttraction ?? '?'}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {details.contentCountLimitSets.length > 0 && (
                <Section title={t('common.templateDetailsDialog.contentCountLimitSets')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {details.contentCountLimitSets.map((set) => (
                      <div key={set.name} className="rounded border border-border p-2">
                        <p className="text-xs font-medium mb-1">{set.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {set.limits.map((l) => `${l.sid} (${l.maxCount ?? '?'})`).join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {details.mandatoryContentSets.length > 0 && (
                <Section title={t('common.templateDetailsDialog.mandatoryContentSets')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {details.mandatoryContentSets.map((set) => (
                      <div key={set.name} className="rounded border border-border p-2">
                        <p className="text-xs font-medium mb-1">{set.name}</p>
                        <p className="text-xs text-muted-foreground">{set.sids.join(', ')}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {details.variants.length > 1 && (
                <div className="flex items-center gap-1 rounded border border-border p-0.5 w-fit">
                  {details.variants.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setVariantIndex(i)}
                      className={`h-6 px-2.5 text-xs rounded-sm transition-colors ${
                        i === variantIndex ? 'bg-secondary text-secondary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('common.templateDetailsDialog.variantN', { n: i + 1 })}
                    </button>
                  ))}
                </div>
              )}

              {variant && (
                <Section title={`Zones (${variant.zones.length})`}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {variant.zones.map((zone) => <ZoneCard key={zone.name} zone={zone} />)}
                  </div>
                </Section>
              )}

              {variant && variant.connections.length > 0 && (
                <Section title={`Connections (${variant.connections.length})`}>
                  <div className="space-y-1">
                    {variant.connections.map((c, i) => (
                      <div key={i} className="text-xs flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{c.from}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{c.to}</span>
                        {c.connectionType && <Badge variant="outline" className="text-[10px] py-0">{c.connectionType}</Badge>}
                        {c.road && <Badge variant="outline" className="text-[10px] py-0">{t('common.templateDetailsDialog.road')}</Badge>}
                        {c.guardValue !== undefined && <span className="text-muted-foreground">{t('common.templateDetailsDialog.guardShort', { value: fmt(c.guardValue) })}</span>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('ui.close')}
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
