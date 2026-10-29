// ─── Custom buff authoring dialog (issue #165) ────────────────────────────────
// Clones a real buff/status-effect definition (Core/DB/buffs/*.json) under a
// brand-new buff id — the same "clone a real definition, edit identity, mint
// a new id, ship it" pattern already used for custom heroes/units/map
// objects/artifacts, including the "Clone one buff" / "Build from scratch"
// mode toggle.
//
// A buff has no map/script identity of its own — it's only ever reached by
// id from somewhere else (an artifact's "Grant a Combat Buff" bonus, an
// objects_logic reward, ...). So unlike artifacts there's no ground-
// placement concept here, just the buff definition itself.
//
// Scope: every common field gets a typed, friendly control — identity
// (name/description/icon), polarity, duration, the `addition` restack rule,
// the five boolean flags, AI weighting, and the full `data.stats` grab-bag
// (BuffStatsEditor.tsx, confirmed against every real buff's stat keys). The
// remaining, genuinely scripting-level fields (`actions`, `mechanics`,
// `disablers`, `immunities`, `sequenceEffect`, `statOverrides`, `vfxList`,
// `timeoutActions`, `mimicStats`, `activationParams`, and a few rarer flags)
// have no bespoke UI — modeling them meaningfully would mean re-implementing
// a chunk of the battle engine's trigger system. They're preserved verbatim
// from the clone source and editable as raw JSON in the "Advanced" section,
// so nothing is ever unrepresentable, just less convenient to hand-edit for
// the long tail — same pattern ArtifactBonusesEditor/EventBankLogicEditor
// already established.

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Loader2, ChevronRight } from '@/components/ui/icons'
import EntityCombobox from '@/components/common/EntityCombobox'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import IconBrowserDialog from '@/components/common/IconBrowserDialog'
import StringListEditor from '@/components/common/StringListEditor'
import BuffStatsEditor from '@/components/tree/BuffStatsEditor'
import { ADDITION_OPTIONS, type DurationMode } from '@/lib/buff-catalog'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useLocalizedTextField } from '@/hooks/useLocalizedTextField'
import LocalizedTextField from '@/components/common/LocalizedTextField'
import FieldInfo from '@/components/common/FieldInfo'
import { mintCustomSid } from '@/lib/zip-export'
import { isBuffIdTaken } from '@/lib/custom-buff-authoring'
import { useTranslation, Trans } from 'react-i18next'

interface CustomBuffEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing custom buff id to edit, or null to author a new one. */
  editingId: string | null
  existingSids: string[]
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function dict(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

// Labels live in en.json under tree.customBuffEditorDialog.flagFields.<key>.
const FLAG_FIELDS = ['canDispel', 'hidden', 'dontMimic', 'dontTriggerAction', 'keepOnDeath'] as const

// "Build from scratch" mode's seed — no real buff has empty stats/tags, so
// there's nothing genuine to clone from. `addition: 'duration'` and
// `isPositive: true` are real data's dominant defaults.
const SCRATCH_BUFF_BASE: Record<string, unknown> = {
  tags: [],
  isPositive: true,
  addition: 'duration',
  data: { stats: {} },
}

// Fields the typed UI below fully owns — everything else in a cloned
// template (actions, mechanics, disablers, immunities, sequenceEffect,
// statOverrides, vfxList, timeoutActions, mimicStats, activationParams, the
// two ignoreDuration* flags, visualMechanics, skipMechTriggers) survives
// untouched in the "Advanced" raw JSON box. `data` is handled separately
// since only `data.stats` is typed — the rest of `data` (disablers/
// immunities/sequenceEffect/alwaysMinDmg) is advanced too.
const TYPED_TOP_KEYS = new Set([
  'id', 'icon', 'name_', 'description_', 'tags', 'isPositive', 'infinite', 'maxDuration',
  'addition', 'canDispel', 'hidden', 'dontMimic', 'dontTriggerAction', 'keepOnDeath',
  'aiValue', 'aiValuePerDuration', 'data',
])

function computeAdvanced(template: Record<string, unknown>): Record<string, unknown> {
  const advanced: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(template)) {
    if (!TYPED_TOP_KEYS.has(k)) advanced[k] = v
  }
  const data = dict(template.data)
  delete data.stats
  if (Object.keys(data).length > 0) advanced.data = data
  return advanced
}

export default function CustomBuffEditorDialog({
  open,
  onOpenChange,
  editingId,
  existingSids,
}: CustomBuffEditorDialogProps) {
  const { t } = useTranslation()
  const localization = useScenarioStore((s) => s.localization)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)
  const removeLocalizationToken = useScenarioStore((s) => s.removeLocalizationToken)
  const renameLocalizationToken = useScenarioStore((s) => s.renameLocalizationToken)
  const customBuffs = useScenarioStore((s) => s.customBuffs)
  const setCustomBuff = useScenarioStore((s) => s.setCustomBuff)
  const removeCustomBuff = useScenarioStore((s) => s.removeCustomBuff)
  const mapName = useScenarioStore((s) => s.mapName)
  const catalog = useCatalogStore((s) => s.catalog)

  const existingDefinition = editingId ? customBuffs[editingId] : undefined

  const [mode, setMode] = useState<'clone' | 'scratch'>('clone')
  const [sourceBuffId, setSourceBuffId] = useState('')
  const [sourcePickerValue, setSourcePickerValue] = useState('')
  const [id, setId] = useState('')
  const [icon, setIcon] = useState('')
  const [isPositive, setIsPositive] = useState(true)
  const [otherTags, setOtherTags] = useState<string[]>([])
  const [durationMode, setDurationMode] = useState<DurationMode>('caster')
  const [fixedDuration, setFixedDuration] = useState(1)
  const [addition, setAddition] = useState('duration')
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [aiValue, setAiValue] = useState(0)
  const [aiValuePerDuration, setAiValuePerDuration] = useState(0)
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advancedText, setAdvancedText] = useState('{}')
  const [advancedError, setAdvancedError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [synced, setSynced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [iconBrowserOpen, setIconBrowserOpen] = useState(false)

  const baseCatalogBuff = catalog?.buffs.find((b) => b.id === sourceBuffId)

  const templateBase: Record<string, unknown> | null =
    existingDefinition?.template ?? (mode === 'clone' ? baseCatalogBuff?.raw ?? null : SCRATCH_BUFF_BASE)
  const baseDisplayName = baseCatalogBuff?.name ?? sourceBuffId
  const catalogMissing = mode === 'clone' && !!sourceBuffId && !existingDefinition && !baseCatalogBuff
  const readyToEdit = mode === 'scratch' || !!sourceBuffId || !!existingDefinition

  const previousNameSid = str(templateBase?.name_)
  const previousDescSid = str(templateBase?.description_)

  const nameField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousNameSid),
  })
  const descField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousDescSid),
    suffix: 'desc_sid',
    optional: true,
  })

  if (open && templateBase && readyToEdit && !initialized) {
    nameField.reset(previousNameSid, previousNameSid ? (localization[previousNameSid] ?? '') : '')
    descField.reset(previousDescSid, previousDescSid ? (localization[previousDescSid] ?? '') : '')
    setIcon(str(templateBase.icon, baseCatalogBuff?.icon ?? ''))
    const tags = Array.isArray(templateBase.tags) ? (templateBase.tags as string[]) : []
    setIsPositive(bool(templateBase.isPositive, !tags.includes('negative')))
    setOtherTags(tags.filter((t) => t !== 'positive' && t !== 'negative'))
    setDurationMode(bool(templateBase.infinite) ? 'infinite' : typeof templateBase.maxDuration === 'number' ? 'fixed' : 'caster')
    setFixedDuration(num(templateBase.maxDuration, 1))
    setAddition(str(templateBase.addition, 'duration'))
    const nextFlags: Record<string, boolean> = {}
    for (const f of FLAG_FIELDS) nextFlags[f] = bool(templateBase[f])
    setFlags(nextFlags)
    setAiValue(num(templateBase.aiValue))
    setAiValuePerDuration(num(templateBase.aiValuePerDuration))
    setStats(dict(dict(templateBase.data).stats))
    setAdvancedText(JSON.stringify(computeAdvanced(templateBase), null, 2))
    setAdvancedError(null)
    setId(
      existingDefinition?.id ??
        mintCustomSid(mapName, 'buff', [
          ...Object.keys(customBuffs),
          ...(catalog?.buffs.map((b) => b.id) ?? []),
        ]),
    )
    setError(null)
    setInitialized(true)
  }

  if (open && existingDefinition && !synced) {
    setSourceBuffId(existingDefinition.sourceBuffId)
    setSourcePickerValue(existingDefinition.sourceBuffId)
    setMode(existingDefinition.sourceBuffId ? 'clone' : 'scratch')
    setSynced(true)
  }
  if (!open && (initialized || sourceBuffId || synced)) {
    setInitialized(false)
    setSourceBuffId('')
    setSourcePickerValue('')
    setMode('clone')
    setSynced(false)
    setAdvancedOpen(false)
  }

  const handleChangeBase = () => {
    setSourceBuffId('')
    setSourcePickerValue('')
    setInitialized(false)
  }

  const handlePickSource = (value: string) => {
    setSourcePickerValue(value)
    const knownIds = catalog?.buffs.map((b) => b.id) ?? []
    if (knownIds.includes(value)) {
      setSourceBuffId(value)
    }
  }

  const trimmedId = id.trim()
  const idTaken =
    trimmedId !== (existingDefinition?.id ?? '') && isBuffIdTaken(trimmedId, catalog, customBuffs)

  const canSave =
    readyToEdit &&
    !catalogMissing &&
    trimmedId !== '' &&
    !idTaken &&
    nameField.trimmedSid !== '' &&
    !advancedError

  const manageToken = (previous: string, next: string, text: string) => {
    if (!next) {
      if (previous) removeLocalizationToken(previous)
      return
    }
    if (previous && previous !== next) {
      renameLocalizationToken(previous, next, text)
    } else {
      setLocalizationToken(next, text)
    }
  }

  const handleAdvancedChange = (text: string) => {
    setAdvancedText(text)
    try {
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setAdvancedError(t('tree.customBuffEditorDialog.mustBeJsonObject'))
      } else {
        setAdvancedError(null)
      }
    } catch (e) {
      setAdvancedError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSave = () => {
    if (!canSave || !templateBase) return
    setSaving(true)
    setError(null)
    try {
      const advanced = JSON.parse(advancedText) as Record<string, unknown>
      const advancedData = dict(advanced.data)
      const tags = [...otherTags, isPositive ? 'positive' : 'negative']

      const template: Record<string, unknown> = {
        ...advanced,
        id: trimmedId,
        name_: nameField.trimmedSid,
        ...(descField.trimmedSid ? { description_: descField.trimmedSid } : {}),
        ...(icon ? { icon } : {}),
        tags,
        isPositive,
        addition,
        ...(durationMode === 'infinite' ? { infinite: true } : {}),
        ...(durationMode === 'fixed' ? { maxDuration: fixedDuration } : {}),
        ...flags,
        aiValue,
        aiValuePerDuration,
        data: { ...advancedData, stats },
      }

      if (existingDefinition && existingDefinition.id !== trimmedId) {
        removeCustomBuff(existingDefinition.id)
      }
      setCustomBuff(trimmedId, {
        id: trimmedId,
        sourceBuffId: mode === 'scratch' ? '' : sourceBuffId,
        template,
      })

      manageToken(previousNameSid, nameField.trimmedSid, nameField.trimmedText)
      manageToken(previousDescSid, descField.trimmedSid, descField.trimmedText)

      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const iconBrowserOptions = (catalog?.buffs ?? [])
    .filter((b) => !!b.icon)
    .map((b) => ({ id: b.icon as string, label: b.name }))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{existingDefinition ? t('tree.customBuffEditorDialog.editCustomBuff') : t('tree.customBuffEditorDialog.newCustomBuff')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t('tree.customBuffEditorDialog.clonesARealBuffStatus')}
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>{t('shared.mode')}</Label>
              <FieldInfo text={t('tree.customBuffEditorDialog.cloneOneBuffEveryField')} />
            </div>
            <div className="flex gap-1.5">
              <Button type="button" aria-pressed={mode === 'clone'} variant={mode === 'clone' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setMode('clone')}>
                {t('tree.customBuffEditorDialog.cloneOneBuff')}
              </Button>
              <Button
                type="button"
                aria-pressed={mode === 'scratch'} variant={mode === 'scratch' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setMode('scratch'); setSourceBuffId(''); setSourcePickerValue('') }}
              >
                {t('shared.buildFromScratch')}
              </Button>
            </div>
          </div>

          {mode === 'clone' && !sourceBuffId && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>{t('tree.customBuffEditorDialog.baseBuff')}</Label>
                <FieldInfo text={t('tree.customBuffEditorDialog.theRealBuffWhoseDefinition')} />
              </div>
              <EntityCombobox
                value={sourcePickerValue}
                onChange={handlePickSource}
                category="buff"
                placeholder={t('tree.customBuffEditorDialog.searchForABuffTo')}
              />
            </div>
          )}

          {catalogMissing && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                {t('tree.customBuffEditorDialog.loadTheCoreZipCatalog')}
              </AlertDescription>
            </Alert>
          )}

          {readyToEdit && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mode === 'clone' && sourceBuffId ? (
                    <Trans i18nKey={existingDefinition ? 'shared.basedOnCustomized' : 'shared.basedOn'} values={{ name: baseDisplayName }} components={{ v: <span className="font-medium text-foreground" /> }} />
                  ) : (
                    t('tree.customBuffEditorDialog.buildingFromScratchStatsAnd')
                  )}
                </p>
                {mode === 'clone' && sourceBuffId && (
                  <button
                    type="button"
                    onClick={handleChangeBase}
                    className="shrink-0 rounded border border-transparent p-0.5 hover:border-border hover:bg-accent"
                    title={t('tree.customBuffEditorDialog.clickToChangeTheBase')}
                  >
                    <CatalogIcon iconId={baseCatalogBuff?.icon} name={baseDisplayName} size={24} />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{t('tree.customBuffEditorDialog.iconOptional')}</Label>
                  <FieldInfo text={t('tree.customBuffEditorDialog.the2DIconShownWherever')} />
                </div>
                <button
                  type="button"
                  onClick={() => setIconBrowserOpen(true)}
                  className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-accent/50"
                >
                  <CatalogIcon iconId={icon} name={baseDisplayName} size={32} />
                  <span className="text-xs text-muted-foreground">{icon ? t('shared.clickToChange') : t('tree.customBuffEditorDialog.clickToSet')}</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="buff-editor-id">{t('shared.id')}</Label>
                  <FieldInfo text={t('tree.customBuffEditorDialog.theUniqueIdThisCustom')} />
                </div>
                <Input
                  id="buff-editor-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="font-mono"
                />
                {idTaken && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="ml-2">{t('tree.customBuffEditorDialog.isAlreadyUsedByAnother', { trimmedId })}</AlertDescription>
                  </Alert>
                )}
              </div>

              <LocalizedTextField
                idPrefix="buff-editor-name"
                managedSidLabel={t('shared.namingSID')}
                unmanagedLabel={t('tree.customBuffEditorDialog.buffNameWrittenDirectlyNo')}
                textLabel={t('tree.customBuffEditorDialog.buffNameText')}
                sidValue={nameField.sidValue}
                textValue={nameField.textValue}
                autoManageLoc
                onSidChange={nameField.handleSidChange}
                onTextChange={nameField.handleTextChange}
                isDuplicate={nameField.trimmedSid !== previousNameSid && nameField.trimmedSid !== '' && existingSids.includes(nameField.trimmedSid)}
                showFirstTimeNote={!previousNameSid}
              />
              <LocalizedTextField
                idPrefix="buff-editor-desc"
                managedSidLabel={t('shared.descriptionSID')}
                unmanagedLabel={t('tree.customBuffEditorDialog.descriptionWrittenDirectlyNoLocalization')}
                textLabel={t('shared.descriptionText')}
                sidValue={descField.sidValue}
                textValue={descField.textValue}
                autoManageLoc
                onSidChange={descField.handleSidChange}
                onTextChange={descField.handleTextChange}
                isDuplicate={descField.trimmedSid !== previousDescSid && descField.trimmedSid !== '' && existingSids.includes(descField.trimmedSid)}
                optional
                bordered
              />

              {/* ── Effect basics ────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tree.customBuffEditorDialog.effectBasics')}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('tree.customBuffEditorDialog.polarity')}</Label>
                    <Select value={isPositive ? 'positive' : 'negative'} onValueChange={(v) => setIsPositive(v === 'positive')}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="positive">{t('tree.customBuffEditorDialog.positiveBuff')}</SelectItem>
                        <SelectItem value="negative">{t('tree.customBuffEditorDialog.negativeDebuff')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>{t('tree.customBuffEditorDialog.reapplyRule')}</Label>
                      <FieldInfo text={ADDITION_OPTIONS.map((o) => `${o.label}: ${o.description}`).join(' ')} />
                    </div>
                    <Select value={addition} onValueChange={setAddition}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADDITION_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{t('tree.customBuffEditorDialog.duration')}</Label>
                    <FieldInfo text={t('tree.customBuffEditorDialog.mostRealBuffsLetThe')} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={durationMode} onValueChange={(v) => setDurationMode(v as DurationMode)}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="caster">{t('tree.customBuffEditorDialog.setByWhateverGrantsIt')}</SelectItem>
                        <SelectItem value="fixed">{t('tree.customBuffEditorDialog.fixedNumberOfRounds')}</SelectItem>
                        <SelectItem value="infinite">{t('tree.customBuffEditorDialog.infiniteUntilRemoved')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {durationMode === 'fixed' && (
                      <Input type="number" className="h-8 w-20 text-xs shrink-0" value={fixedDuration} onChange={(e) => setFixedDuration(Number(e.target.value) || 1)} />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{t('tree.customBuffEditorDialog.otherTagsAdvancedOptional')}</Label>
                    <FieldInfo text={t('tree.customBuffEditorDialog.freeFormTagsSomeReal')} />
                  </div>
                  <StringListEditor values={otherTags} onChange={setOtherTags} addLabel={t('tree.customBuffEditorDialog.addTag')} placeholder={t('tree.customBuffEditorDialog.tag')} />
                </div>
              </div>

              {/* ── Flags ────────────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tree.customBuffEditorDialog.flags')}</p>
                {FLAG_FIELDS.map((f) => (
                  <label key={f} className="flex items-start gap-2 text-xs">
                    <Checkbox className="mt-0.5" checked={!!flags[f]} onCheckedChange={(c) => setFlags((prev) => ({ ...prev, [f]: !!c }))} />
                    <span>
                      <span className="font-medium">{t(`tree.customBuffEditorDialog.flagFields.${f}.label`)}</span>
                      <span className="block text-muted-foreground">{t(`tree.customBuffEditorDialog.flagFields.${f}.description`)}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* ── AI weighting ─────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('tree.customBuffEditorDialog.aIWeighting')}</p>
                  <FieldInfo text={t('tree.customBuffEditorDialog.usedByTheGamesAI')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('tree.customBuffEditorDialog.aIValue')}</Label>
                    <Input type="number" value={aiValue} onChange={(e) => setAiValue(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('tree.customBuffEditorDialog.aIValuePerDurationRound')}</Label>
                    <Input type="number" value={aiValuePerDuration} onChange={(e) => setAiValuePerDuration(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* ── Stat effects ─────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{t('tree.customBuffEditorDialog.statEffects')}</Label>
                  <FieldInfo text={t('tree.customBuffEditorDialog.theStatChangesThisEffect')} />
                </div>
                <BuffStatsEditor stats={stats} onChange={setStats} />
              </div>

              {/* ── Advanced ─────────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  <ChevronRight className={`h-3 w-3 transition-transform ${advancedOpen ? 'rotate-90' : ''}`} />
                  {t('tree.customBuffEditorDialog.advancedRawJSON')}
                </button>
                {advancedOpen && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      {t('tree.customBuffEditorDialog.anythingNotCoveredAboveTriggered')}
                    </p>
                    <textarea
                      className="w-full h-40 rounded-md border border-border bg-background p-2 font-mono text-xs"
                      value={advancedText}
                      onChange={(e) => handleAdvancedChange(e.target.value)}
                      spellCheck={false}
                    />
                    {advancedError && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="ml-2">{advancedError}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('shared.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {t('shared.save')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <IconBrowserDialog
        open={iconBrowserOpen}
        onOpenChange={setIconBrowserOpen}
        title={t('tree.customBuffEditorDialog.chooseABuffIcon')}
        options={iconBrowserOptions}
        currentIconId={icon}
        onPick={setIcon}
      />
    </Dialog>
  )
}
