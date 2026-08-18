// ─── Full hero-authoring dialog (issue #141, unified in issue #160) ──────────
// Extends issue #139's minimal "customize hero name/description/motto" flow
// (SetDisplayNameDialog.tsx) to every real field in a hero JSON
// (Core/DB/heroes/**/*.json). Reuses that same write path unchanged: clone
// whichever hero definition the spawner currently uses (or an already-
// customized clone's own definition), let the user edit it, repoint
// objectsProperties.propHeroes.heroSid at the (new or existing) clone via
// saveMapFile({kind:'setHeroSid'}), and store the definition in
// useScenarioStore's customHeroes (shipped later by zip-export.ts to
// DB/heroes/custom_maps/{heroSid}.json — the same real mechanism a shipped
// map already uses, see plans/testItems-props-reference.md).
//
// Fields the game derives purely from fraction+classType (mesh, mounts,
// skillsRollVariant, and a starting point for stats/statsRolls) are computed
// live from whichever real catalog hero already matches that combination
// (src/lib/hero-authoring.ts), not shown as free-editable — confirmed 1:1
// across every real hero in the game. statsRolls specifically is never
// shown at all, per the issue, and is just carried through from the same
// representative hero.
//
// "Id" doubles as the heroSid this clone ships under (every real custom
// hero file's own "id" matches its filename exactly, e.g.
// cm_fun_hero_1.json -> "id": "cm_fun_hero_1") — validated live against
// every hero id in the game (catalog.heroes already covers all of
// Core/DB/heroes/** recursively, real+campaign+tutorial+custom_maps) plus
// every custom hero already authored on this map.
//
// Issue #160 unified this with Custom Objects/Custom Artifacts: `entity` is
// now optional — null when authoring/editing a custom hero standalone from
// the new sidebar "Custom Heroes" section (see `editingHeroSid`), non-null
// for the original per-placed-spawner flow (Entity SIDs / Map Grid "Edit
// full hero"). Both share the same "Clone one hero" / "Build from scratch"
// mode + EntityCombobox base-hero picker CustomObjectEditorDialog already
// established — a capability gap the standalone flow needed anyway (you
// could not previously pick an arbitrary hero as the clone source; the base
// was locked to whatever the spawner already pointed at). "Build from
// scratch" needs no base hero at all: every helper below (`str`/`num`/
// `toStats`/`toSquadEntries`/etc.) already tolerates an absent definition
// and falls back to sensible defaults, and mesh/mount/skillsRollVariant/
// baseline stats are derived live from fraction+classType alone
// (hero-authoring.ts) — so "scratch" needed no new derivation logic, only
// relaxed gating on what used to require a base definition to render at all.
// A standalone-authored hero writes only to the `customHeroes` store slice,
// same as objects/artifacts — never `saveMapFile`, which only makes sense
// when repointing an actual placed spawner (`entity` present).

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
import { AlertTriangle, Loader2 } from 'lucide-react'
import EntityCombobox from '@/components/common/EntityCombobox'
import { ENTITY_REGISTRIES } from '@/schema/entities'
import type { MapEntity } from '@/types/map-context'
import type {
  HeroDefinitionFields,
  HeroSquadEntry,
  HeroSkillEntry,
  HeroMagicEntry,
  HeroStats,
} from '@/types/hero-definition'
import { saveMapFile } from '@/lib/map-save'
import { mintCustomHeroSid } from '@/lib/zip-export'
import { getMeshOptions, getMountForFraction, getSkillsRollVariant, getDefaultStatsAndRolls, isHeroIdTaken } from '@/lib/hero-authoring'
import { BIOME_NAMES } from '@/lib/map-grid/terrain-colors'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useLocalizedTextField } from '@/hooks/useLocalizedTextField'
import LocalizedTextField from '@/components/common/LocalizedTextField'
import FieldInfo from '@/components/common/FieldInfo'
import HeroCatalogListEditor from '@/components/tree/HeroCatalogListEditor'
import HeroPickerDialog from '@/components/catalog/HeroPickerDialog'
import { PortraitThumb, heroPortraitPath } from '@/lib/catalog/thumbnails'
import {assetLeafName, LARGE_PORTRAIT_SUFFIX} from '@/lib/catalog/icon-requests.ts';

interface HeroEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The placed hero spawner being edited, or null when authoring/editing a
   *  custom hero standalone (via the sidebar's "Custom Heroes" section) —
   *  see `editingHeroSid` for which case applies then. */
  entity: MapEntity | null
  mapFilePath: string | null
  existingSids: string[]
  /** Only meaningful when `entity` is null: an existing customHeroes key to
   *  edit, or null/undefined to author a brand new one. */
  editingHeroSid?: string | null
}

// ─── Safe readers off an opaque cloned definition ────────────────────────────

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function firstNumber(v: unknown, fallback: number): number {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : fallback
}

const DEFAULT_STATS: HeroStats = {
  viewRadius: 6,
  statsNum: 1,
  magicCastsPerRound: 1,
  enableTactics: true,
  tacticsPlacementSize: 3,
  enableHeroNativeBiome: true,
  offence: 1,
  defence: 1,
  spellPower: 1,
  intelligence: 1,
  luck: 0,
  moral: 0,
}

function toStats(v: unknown): HeroStats {
  if (!v || typeof v !== 'object') return DEFAULT_STATS
  const r = v as Record<string, unknown>
  return {
    viewRadius: num(r.viewRadius, 6),
    statsNum: num(r.statsNum, 1),
    magicCastsPerRound: num(r.magicCastsPerRound, 1),
    enableTactics: bool(r.enableTactics, true),
    tacticsPlacementSize: num(r.tacticsPlacementSize, 3),
    enableHeroNativeBiome: bool(r.enableHeroNativeBiome, true),
    offence: num(r.offence),
    defence: num(r.defence),
    spellPower: num(r.spellPower),
    intelligence: num(r.intelligence),
    luck: num(r.luck),
    moral: num(r.moral),
  }
}

function toSquadEntries(v: unknown): HeroSquadEntry[] {
  if (!Array.isArray(v)) return []
  return v
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>
      return { sid: str(r.sid), min: num(r.min, 1), max: num(r.max, 1) }
    })
    .filter((e) => e.sid)
}

function toSkillEntries(v: unknown): HeroSkillEntry[] {
  if (!Array.isArray(v)) return []
  return v
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>
      return { sid: str(r.sid), skillLevel: num(r.skillLevel, 1) }
    })
    .filter((e) => e.sid)
}

function toMagicEntries(v: unknown): HeroMagicEntry[] {
  if (!Array.isArray(v)) return []
  return v
    .map((e) => {
      const r = (e ?? {}) as Record<string, unknown>
      return { sidConfig: str(r.sidConfig), level: num(r.level, 1), isLearned: bool(r.isLearned, true) }
    })
    .filter((e) => e.sidConfig)
}

const CLASS_TYPES: Array<{ id: HeroDefinitionFields['classType']; label: string }> = [
  { id: 'might', label: 'Might (Warrior)' },
  { id: 'magic', label: 'Magic (Mage)' },
]

const FALLBACK_FRACTIONS = ['human', 'undead', 'demon', 'dungeon', 'nature', 'unfrozen']

type HeroNumericStatKey = 'offence' | 'defence' | 'spellPower' | 'intelligence' | 'luck' | 'moral'

const STATS_FIELDS: Array<{ key: HeroNumericStatKey; label: string }> = [
  { key: 'offence', label: 'Offence' },
  { key: 'defence', label: 'Defence' },
  { key: 'spellPower', label: 'Spell power' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'luck', label: 'Luck' },
  { key: 'moral', label: 'Morale' },
]

export default function HeroEditorDialog({
  open,
  onOpenChange,
  entity,
  mapFilePath,
  existingSids,
  editingHeroSid,
}: HeroEditorDialogProps) {
  const localization = useScenarioStore((s) => s.localization)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)
  const removeLocalizationToken = useScenarioStore((s) => s.removeLocalizationToken)
  const renameLocalizationToken = useScenarioStore((s) => s.renameLocalizationToken)
  const customHeroes = useScenarioStore((s) => s.customHeroes)
  const setCustomHero = useScenarioStore((s) => s.setCustomHero)
  const removeCustomHero = useScenarioStore((s) => s.removeCustomHero)
  const mapName = useScenarioStore((s) => s.mapName)
  const catalog = useCatalogStore((s) => s.catalog)

  const [mode, setMode] = useState<'clone' | 'scratch'>('clone')
  const [sourceHeroSid, setSourceHeroSid] = useState('')
  const [sourcePickerValue, setSourcePickerValue] = useState('')
  // Tracks whether this open has already pulled sourceHeroSid/mode from the
  // entity/existing definition once — mirrors CustomObjectEditorDialog's
  // `synced`, so "Change base" (which clears sourceHeroSid) sticks instead
  // of snapping back on the next render.
  const [synced, setSynced] = useState(false)

  const isEntityHero = entity?.source === 'heroSpawner'
  const currentHeroSid = isEntityHero ? (entity?.heroSid ?? '') : ''
  // Which customHeroes entry are we editing (if any)? The entity's own
  // placed heroSid for the per-spawner flow, or the explicit key passed in
  // for the standalone sidebar flow — never both at once.
  const editingKey = isEntityHero ? currentHeroSid : (editingHeroSid ?? '')
  const existingCustomHero = editingKey ? customHeroes[editingKey] : undefined
  const baseHeroSid = existingCustomHero?.sourceHeroSid || sourceHeroSid
  const baseCatalogHero = catalog?.heroes.find((h) => h.id === baseHeroSid)
  // Absent (null) in a fresh "Build from scratch" pick — every field-seeding
  // helper below already treats that as "use sensible defaults" rather than
  // requiring a real definition to clone from.
  const heroBaseDefinition: Record<string, unknown> | null =
    existingCustomHero?.definition ?? (mode === 'clone' ? baseCatalogHero?.raw ?? null : null)
  const heroHasNoBase = isEntityHero && !currentHeroSid
  const catalogMissing = mode === 'clone' && !!baseHeroSid && !existingCustomHero && !baseCatalogHero
  // Once true, the full form renders — either a base/definition to seed from
  // exists, or "Build from scratch" was explicitly chosen (which needs none).
  const readyToEdit = mode === 'scratch' || !!baseHeroSid || !!existingCustomHero
  const heroDisplayName = (sid: string) => catalog?.heroes.find((h) => h.id === sid)?.name ?? sid

  const previousSid = str(heroBaseDefinition?.name)
  const previousDescSid = str(heroBaseDefinition?.description)
  const previousMottoSid = str(heroBaseDefinition?.motto)

  const nameField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousSid),
  })
  const descField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousDescSid),
    suffix: 'desc_sid',
    optional: true,
  })
  const mottoField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousMottoSid),
    suffix: 'motto_sid',
    optional: true,
  })

  const [id, setId] = useState('')
  const [icon, setIcon] = useState('')
  const [fraction, setFraction] = useState('')
  const [classType, setClassType] = useState<HeroDefinitionFields['classType']>('might')
  const [nativeBiome, setNativeBiome] = useState('')
  const [costGold, setCostGold] = useState(2500)
  const [startLevel, setStartLevel] = useState(1)
  const [attackTime, setAttackTime] = useState(0.5)
  const [specialization, setSpecialization] = useState('')
  const [stats, setStats] = useState<HeroStats>(DEFAULT_STATS)
  const [statsRolls, setStatsRolls] = useState<unknown>(null)
  const [startSquad, setStartSquad] = useState<HeroSquadEntry[]>([])
  const [startSquadAlt, setStartSquadAlt] = useState<HeroSquadEntry[]>([])
  const [startSkills, setStartSkills] = useState<HeroSkillEntry[]>([])
  const [startMagics, setStartMagics] = useState<HeroMagicEntry[]>([])
  const [portraitPickerOpen, setPortraitPickerOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull sourceHeroSid/mode from the entity or an existing standalone
  // definition once per open — guarded by `synced` (not sourceHeroSid) so
  // "Change base" sticks instead of snapping back on the next render.
  if (open && !synced) {
    if (isEntityHero) {
      const src = existingCustomHero?.sourceHeroSid || currentHeroSid
      setSourceHeroSid(src)
      setSourcePickerValue(src)
      setMode('clone')
    } else if (editingHeroSid) {
      const existing = customHeroes[editingHeroSid]
      const src = existing?.sourceHeroSid ?? ''
      setSourceHeroSid(src)
      setSourcePickerValue(src)
      // A previously scratch-made hero recorded no source — infer mode from
      // that rather than defaulting everyone to 'clone'.
      setMode(src ? 'clone' : 'scratch')
    }
    setSynced(true)
  }

  // Seed every field once per open, from whichever definition is being
  // cloned/edited — mirrors SetDisplayNameDialog's open/entity effect, but
  // covers the full field set instead of 3 text fields.
  if (open && !initialized && (readyToEdit || heroHasNoBase || catalogMissing)) {
    const def = heroBaseDefinition
    nameField.reset(previousSid, previousSid ? (localization[previousSid] ?? '') : '')
    descField.reset(previousDescSid, previousDescSid ? (localization[previousDescSid] ?? '') : '')
    mottoField.reset(previousMottoSid, previousMottoSid ? (localization[previousMottoSid] ?? '') : '')
    setId(existingCustomHero?.heroSid ?? mintCustomHeroSid(mapName, [...Object.keys(customHeroes), ...(catalog?.heroes.map((h) => h.id) ?? [])]))
    setIcon(str(def?.icon))
    setFraction(str(def?.fraction))
    setClassType(str(def?.classType, 'might') === 'magic' ? 'magic' : 'might')
    setNativeBiome(str(def?.nativeBiome))
    setCostGold(num(def?.costGold, 2500))
    setStartLevel(num(def?.startLevel, 1))
    setAttackTime(firstNumber(def?.attacksTimesBefore, 0.5))
    setSpecialization(str(def?.specialization))
    setStats(toStats(def?.stats))
    setStatsRolls(def?.statsRolls ?? null)
    setStartSquad(toSquadEntries(def?.startSquad))
    setStartSquadAlt(toSquadEntries(def?.startSquadAlt))
    setStartSkills(toSkillEntries(def?.startSkills))
    setStartMagics(toMagicEntries(def?.startMagics))
    setError(null)
    setInitialized(true)
  }
  if (!open && (initialized || synced)) {
    setInitialized(false)
    setSynced(false)
    setMode('clone')
    setSourceHeroSid('')
    setSourcePickerValue('')
  }

  // A non-null entity that isn't a hero spawner is a caller mistake — every
  // other case (no entity at all, or a real hero spawner) is valid.
  if (entity && !isEntityHero) return null

  const handleChangeBase = () => {
    setSourceHeroSid('')
    setSourcePickerValue('')
    setInitialized(false)
  }

  const handlePickSource = (value: string) => {
    setSourcePickerValue(value)
    const knownIds = catalog ? catalog.heroes.map((h) => h.id) : ENTITY_REGISTRIES.hero.map((h) => h.id)
    if (knownIds.includes(value)) setSourceHeroSid(value)
  }

  const meshOptions = getMeshOptions(catalog, fraction, classType)
  const mount = getMountForFraction(catalog, fraction)
  const skillsRollVariant = getSkillsRollVariant(catalog, fraction, classType)

  const handleFractionChange = (v: string) => {
    setFraction(v)
    const seed = getDefaultStatsAndRolls(catalog, v, classType)
    if (seed) {
      setStats(toStats(seed.stats))
      setStatsRolls(seed.statsRolls)
    }
  }
  const handleClassTypeChange = (v: HeroDefinitionFields['classType']) => {
    setClassType(v)
    const seed = getDefaultStatsAndRolls(catalog, fraction, v)
    if (seed) {
      setStats(toStats(seed.stats))
      setStatsRolls(seed.statsRolls)
    }
  }

  const trimmedId = id.trim()
  const idTaken =
    trimmedId !== (existingCustomHero?.heroSid ?? '') && isHeroIdTaken(trimmedId, catalog, customHeroes)

  const specializationOptions = (catalog?.specializations ?? [])
    .map((s) => {
      const hero = catalog?.heroes.find((h) => h.id === s.forHeroSid)
      return { id: s.id, heroName: hero?.name ?? s.forHeroSid, fraction: hero?.fraction }
    })
    .filter((s) => !fraction || s.fraction === fraction)
    .sort((a, b) => a.heroName.localeCompare(b.heroName))

  const fractionOptions = catalog?.factions.length
    ? catalog.factions.map((f) => ({ id: f.id, label: f.name }))
    : FALLBACK_FRACTIONS.map((f) => ({ id: f, label: f }))

  const canSave =
    (!entity || !!mapFilePath) &&
    !heroHasNoBase &&
    !catalogMissing &&
    readyToEdit &&
    trimmedId !== '' &&
    !idTaken &&
    fraction !== '' &&
    nameField.trimmedSid !== ''

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

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const definition: Record<string, unknown> = {
        id: trimmedId,
        name: nameField.trimmedSid,
        description: descField.trimmedSid,
        motto: mottoField.trimmedSid,
        mesh: meshOptions[0] ?? str(heroBaseDefinition?.mesh),
        mounts: mount ? [mount] : strArr(heroBaseDefinition?.mounts),
        icon,
        fraction,
        nativeBiome,
        classType,
        skillsRollVariant: skillsRollVariant ?? str(heroBaseDefinition?.skillsRollVariant),
        costGold,
        startLevel,
        attacksTimesBefore: [attackTime],
        startSquad,
        startSquadAlt,
        specialization,
        stats,
        statsRolls,
        startSkills,
        startMagics,
      }

      // Only a placed spawner needs its .map entry repointed — a standalone
      // custom hero (authored from the sidebar) has no placement to update,
      // exactly like custom objects/artifacts never touch the .map file.
      if (entity) {
        const entityType = Number(entity.type)
        if (!Number.isFinite(entityType)) {
          throw new Error(`Entity has a non-numeric type ("${entity.type}") — cannot target it`)
        }
        await saveMapFile(mapFilePath!, {
          kind: 'setHeroSid',
          entityType,
          entityId: entity.id,
          heroSid: trimmedId,
        })
      }

      // Renaming an already-customized hero's id — drop the stale entry so
      // it doesn't linger as an orphaned, unreferenced customHeroes key.
      if (existingCustomHero && existingCustomHero.heroSid !== trimmedId) {
        removeCustomHero(existingCustomHero.heroSid)
      }
      // "Build from scratch" records no specific source hero — mesh/mount/
      // skill table trace back to fraction+classType instead, not one
      // individual hero's identity.
      setCustomHero(trimmedId, { heroSid: trimmedId, sourceHeroSid: mode === 'scratch' ? '' : baseHeroSid, definition })

      manageToken(previousSid, nameField.trimmedSid, nameField.trimmedText)
      manageToken(previousDescSid, descField.trimmedSid, descField.trimmedText)
      manageToken(previousMottoSid, mottoField.trimmedSid, mottoField.trimmedText)

      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        // This dialog holds a large local draft (up to 18 fields, several of
        // them multi-row list editors) that only commits on "Save to .map" —
        // an accidental click just outside the dialog would otherwise
        // silently discard all of it. Escape and Cancel still close normally.
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{entity ? 'Edit full hero' : existingCustomHero ? 'Edit custom hero' : 'New custom hero'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!entity && (
            <p className="text-xs text-muted-foreground">
              Clones a real hero's definition under a brand-new id, or builds one from just a
              fraction/class type — the same "clone, edit, ship" mechanism custom objects and
              artifacts use. This app authors and ships the definition only; the official Unfrozen
              map editor is where a hero spawner actually gets placed to use it.
            </p>
          )}

          {(heroHasNoBase || catalogMissing) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                {heroHasNoBase
                  ? 'This spawner has no hero assigned yet — assign one first, then reopen this dialog.'
                  : "Load the Core.zip catalog (Game Database) to look up and clone this hero's base definition."}
              </AlertDescription>
            </Alert>
          )}

          {!heroHasNoBase && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Mode</Label>
                <FieldInfo text="Clone one hero: every field starts from a real hero's own values. Build from scratch: skip picking a specific hero — mesh/mount/skill table/starting stats come from fraction + class type alone, and squad/skills/magics start empty. Switchable at any time." />
              </div>
              <div className="flex gap-1.5">
                <Button type="button" variant={mode === 'clone' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setMode('clone')}>
                  Clone one hero
                </Button>
                <Button
                  type="button"
                  variant={mode === 'scratch' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setMode('scratch'); setSourceHeroSid(''); setSourcePickerValue('') }}
                >
                  Build from scratch
                </Button>
              </div>
            </div>
          )}

          {mode === 'clone' && !baseHeroSid && !heroHasNoBase && (
            <div className="space-y-1.5">
              <Label>Base hero</Label>
              <EntityCombobox
                value={sourcePickerValue}
                onChange={handlePickSource}
                category="hero"
                placeholder="Search for a hero to clone…"
              />
            </div>
          )}

          {readyToEdit && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mode === 'clone' && baseHeroSid ? (
                    <>
                      Based on: <span className="font-medium text-foreground">{heroDisplayName(baseHeroSid)}</span>
                      {existingCustomHero && ' (already customized)'} — mesh, mounts, skill table, and
                      starting stats are re-derived from a real hero matching the fraction/class you pick
                      below.
                    </>
                  ) : (
                    'Building from scratch — mesh, mount, skill table, and starting stats come from the fraction/class type below; squad/skills/magics start empty.'
                  )}
                </p>
                {mode === 'clone' && baseHeroSid && (
                  <button
                    type="button"
                    onClick={handleChangeBase}
                    className="shrink-0 rounded border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground hover:border-border hover:bg-accent"
                    title="Click to change the base hero"
                  >
                    Change base
                  </button>
                )}
              </div>

              {/* ── Identity ─────────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="hero-editor-id">Id</Label>
                  <FieldInfo text="The unique id this custom hero ships under — also becomes the filename (DB/heroes/custom_maps/{id}.json) and the value objectsProperties.propHeroes.heroSid is repointed to. Must not match any hero id already in the game." />
                </div>
                <Input
                  id="hero-editor-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="font-mono"
                />
                {idTaken && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="ml-2">"{trimmedId}" is already used by another hero.</AlertDescription>
                  </Alert>
                )}
              </div>

              <LocalizedTextField
                idPrefix="hero-editor-name"
                managedSidLabel="Naming SID"
                unmanagedLabel="Hero name (written directly, no localization)"
                textLabel="Hero name text"
                sidValue={nameField.sidValue}
                textValue={nameField.textValue}
                autoManageLoc
                onSidChange={nameField.handleSidChange}
                onTextChange={nameField.handleTextChange}
                isDuplicate={nameField.trimmedSid !== previousSid && nameField.trimmedSid !== '' && existingSids.includes(nameField.trimmedSid)}
                showFirstTimeNote={!previousSid}
              />
              <LocalizedTextField
                idPrefix="hero-editor-desc"
                managedSidLabel="Description SID"
                unmanagedLabel="Description (written directly, no localization)"
                textLabel="Description text"
                sidValue={descField.sidValue}
                textValue={descField.textValue}
                autoManageLoc
                onSidChange={descField.handleSidChange}
                onTextChange={descField.handleTextChange}
                isDuplicate={descField.trimmedSid !== previousDescSid && descField.trimmedSid !== '' && existingSids.includes(descField.trimmedSid)}
                optional
                bordered
              />
              <LocalizedTextField
                idPrefix="hero-editor-motto"
                managedSidLabel="Motto SID"
                unmanagedLabel="Motto (written directly, no localization)"
                textLabel="Motto text"
                sidValue={mottoField.sidValue}
                textValue={mottoField.textValue}
                autoManageLoc
                onSidChange={mottoField.handleSidChange}
                onTextChange={mottoField.handleTextChange}
                isDuplicate={mottoField.trimmedSid !== previousMottoSid && mottoField.trimmedSid !== '' && existingSids.includes(mottoField.trimmedSid)}
                optional
                bordered
              />

              {/* ── Appearance ───────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Appearance</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Fraction</Label>
                      <FieldInfo text="Which faction this hero belongs to. Determines the available mesh, mount, skill table, and portrait options below." />
                    </div>
                    <Select value={fraction} onValueChange={handleFractionChange}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select fraction" /></SelectTrigger>
                      <SelectContent>
                        {fractionOptions.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Class type</Label>
                      <FieldInfo text="Might (warrior) or magic (mage). Determines this hero's mesh and starting stat profile — might heroes start with higher offence/defence, magic heroes with higher spell power/intelligence." />
                    </div>
                    <Select value={classType} onValueChange={(v) => handleClassTypeChange(v as HeroDefinitionFields['classType'])}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLASS_TYPES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <p>
                    Mesh: <span className="font-mono text-foreground">{meshOptions[0] ?? '—'}</span>{' '}
                    <FieldInfo text="Auto-selected from fraction + class type — every real hero of this combination uses this exact mesh." />
                  </p>
                  <p>
                    Mount: <span className="font-mono text-foreground">{mount ?? '—'}</span>{' '}
                    <FieldInfo text="Auto-selected from fraction — each faction has exactly one mount." />
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <PortraitThumb
                    iconId={icon}
                    name={nameField.trimmedText || 'Hero portrait'}
                    size={40}
                    previewSize={224}
                    resolve={heroPortraitPath}
                    className="flex h-10 w-10 items-center justify-center rounded border border-border bg-card"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1">
                      <Label>Icon</Label>
                      <FieldInfo text="The hero's portrait, shown in-game on the hero screen and dialogs." />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="font-mono text-xs h-8" />
                      <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => setPortraitPickerOpen(true)}>
                        Browse…
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>Native biome</Label>
                    <FieldInfo text="The terrain type this hero is native to — affects movement/vision bonuses on that biome (enableHeroNativeBiome)." />
                  </div>
                  <Select value={nativeBiome} onValueChange={setNativeBiome}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select biome" /></SelectTrigger>
                    <SelectContent>
                      {Object.values(BIOME_NAMES).map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Core numbers ─────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Core numbers</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Cost (gold)</Label>
                    <Input type="number" value={costGold} onChange={(e) => setCostGold(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start level</Label>
                    <Input type="number" value={startLevel} onChange={(e) => setStartLevel(Number(e.target.value) || 1)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Attack speed</Label>
                      <FieldInfo text="attacksTimesBefore[0] — every real hero uses 0.5." />
                    </div>
                    <Input type="number" step="0.1" value={attackTime} onChange={(e) => setAttackTime(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* ── Combat stats ─────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-3">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Combat stats</p>
                  <FieldInfo text="Seeded from a real hero matching the chosen fraction + class type, editable from there. Re-seeds automatically whenever fraction or class type changes above." />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {STATS_FIELDS.map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        value={stats[key]}
                        onChange={(e) => setStats({ ...stats, [key]: Number(e.target.value) || 0 })}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Skill table: <span className="font-mono text-foreground">{skillsRollVariant ?? '—'}</span>{' '}
                  <FieldInfo text="skillsRollVariant — which level-up skill odds table this hero uses. Auto-selected from fraction + class type, not editable." />
                </p>
              </div>

              {/* ── Specialization ───────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Specialization</Label>
                  <FieldInfo text="A hero specialization (Core/DB/heroes_specializations/) this hero gains bonuses from as it levels — reused from an existing hero's specialization, not authored here." />
                </div>
                <Select value={specialization} onValueChange={setSpecialization}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select specialization" /></SelectTrigger>
                  <SelectContent>
                    {specializationOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.heroName} ({s.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Squads / skills / magics ─────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Start squad</Label>
                  <FieldInfo text="Units this hero starts with — up to 7 (the number of army slots a hero has)." />
                </div>
                <HeroCatalogListEditor
                  category="creature"
                  rows={startSquad}
                  onChange={setStartSquad}
                  maxRows={7}
                  refField="sid"
                  emptyRow={{ sid: '', min: 1, max: 1 }}
                  addLabel="Add unit"
                  renderExtraFields={(row, _i, update) => (
                    <>
                      <Input type="number" value={row.min} onChange={(e) => update({ min: Number(e.target.value) || 0 })} className="h-8 w-16 text-xs" title="Min" />
                      <Input type="number" value={row.max} onChange={(e) => update({ max: Number(e.target.value) || 0 })} className="h-8 w-16 text-xs" title="Max" />
                    </>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Start squad (alt)</Label>
                  <FieldInfo text="An alternate starting squad the game may use instead of the primary one (e.g. for a different scenario context)." />
                </div>
                <HeroCatalogListEditor
                  category="creature"
                  rows={startSquadAlt}
                  onChange={setStartSquadAlt}
                  maxRows={7}
                  refField="sid"
                  emptyRow={{ sid: '', min: 1, max: 1 }}
                  addLabel="Add unit"
                  renderExtraFields={(row, _i, update) => (
                    <>
                      <Input type="number" value={row.min} onChange={(e) => update({ min: Number(e.target.value) || 0 })} className="h-8 w-16 text-xs" title="Min" />
                      <Input type="number" value={row.max} onChange={(e) => update({ max: Number(e.target.value) || 0 })} className="h-8 w-16 text-xs" title="Max" />
                    </>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Start skills</Label>
                <HeroCatalogListEditor
                  category="skill"
                  rows={startSkills}
                  onChange={setStartSkills}
                  maxRows={6}
                  refField="sid"
                  emptyRow={{ sid: '', skillLevel: 1 }}
                  addLabel="Add skill"
                  renderExtraFields={(row, _i, update) => (
                    <Input type="number" min={1} max={3} value={row.skillLevel} onChange={(e) => update({ skillLevel: Number(e.target.value) || 1 })} className="h-8 w-16 text-xs" title="Level" />
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Start magics</Label>
                <HeroCatalogListEditor
                  category="spell"
                  rows={startMagics}
                  onChange={setStartMagics}
                  maxRows={6}
                  refField="sidConfig"
                  emptyRow={{ sidConfig: '', level: 1, isLearned: true }}
                  addLabel="Add spell"
                  renderExtraFields={(row, _i, update) => (
                    <>
                      <Input type="number" value={row.level} onChange={(e) => update({ level: Number(e.target.value) || 1 })} className="h-8 w-16 text-xs" title="Level" />
                      <div className="flex items-center gap-1 shrink-0">
                        <Checkbox checked={row.isLearned} onCheckedChange={(c) => update({ isLearned: c === true })} />
                        <Label className="text-xs cursor-pointer">Learned</Label>
                      </div>
                    </>
                  )}
                />
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">{error}</AlertDescription>
            </Alert>
          )}

          {entity && (
            <p className="text-xs text-muted-foreground">
              Writes directly to the loaded <code>.map</code> file and this map's project data.
              A one-time backup is kept at <code>.map.bak</code> next to it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {entity ? 'Save to .map' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <HeroPickerDialog
        open={portraitPickerOpen}
        onOpenChange={setPortraitPickerOpen}
        mode="portrait"
        value={icon}
        onSelect={(entry) => setIcon(assetLeafName(entry.icon).replace(new RegExp(`${LARGE_PORTRAIT_SUFFIX}$`), ''))}
      />
    </Dialog>
  )
}
