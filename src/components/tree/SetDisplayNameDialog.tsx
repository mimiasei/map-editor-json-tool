// ─── Set a custom display name on a map object and write it to the .map file ─
// Desktop-only test feature — see issue #120. Targets objectsProperties.propsName
// (nameTitle), scoped for now to objects that already have an entity SID —
// this editor's job is scripting, not full map authoring, so it only reaches
// objects it already surfaces elsewhere (the Entity SIDs sidebar).
//
// issue #125 item 6: the game always treats nameTitle as a localization SID
// lookup, never literal text — writing the typed text straight into it (the
// original behavior) rendered in-game as "LOC:<text>" whenever no matching
// token existed, which was always, since nothing ever registered one. Fixed
// by generating a real SID from the text (see slugify.ts) and registering
// the text as that SID's English localization token instead.
//
// issue #132: a city spawner's name doesn't live in propsName at all — the
// game reads objectsProperties.propCities.customCityName instead, which
// follows the exact same "always a SID, never literal text" rule. entity.isCitySpawner
// (set by the caller) routes the write to the right table transparently —
// this dialog's UI and SID-generation logic are otherwise identical either way.
//
// issue #133: redesigned for more user control. The old version hid the SID
// entirely and silently regenerated a brand-new one from the typed text on
// every single save — editing an existing name's text would orphan its old
// localization token forever and repoint the file at a fresh one. Now both
// the naming SID and its text are shown and independently editable, and an
// opt-in checkbox controls whether this dialog manages a localization token
// at all (unchecked writes the SID field's raw value straight into the file,
// same as the original pre-#125 behavior — now a deliberate choice instead
// of an accident). The old "legacy value" warning (`.endsWith('_sid')`,
// which false-fired on any auto-generated SID with a collision suffix like
// `_name_sid_2`) is gone, replaced by a plain first-time note gated on
// genuine first-time state (no prior nameTitle/customCityName at all).
//
// issue #139: heroes no longer use propsName at all. Investigation (see
// plans/testItems-props-reference.md) found propsName is never read by the
// game for a hero-spawner in any of 25 real placements checked — but also
// found a real, working alternative in a shipped map: Fun_and_Graves.map's
// hero spawner points objectsProperties.propHeroes.heroSid at
// "cm_fun_hero_1", a hero DEFINITION file at
// Core/DB/heroes/custom_maps/cm_fun_hero_1.json whose name/description/motto
// are themselves localization SIDs. So for a hero, this dialog now clones
// whichever hero definition the spawner currently uses (from the loaded
// Core.zip catalog, or an already-customized clone), lets the user edit
// name/description/motto on top of that clone, and repoints the spawner's
// heroSid at the (new or existing) clone — everything else about the hero
// (stats, squad, mesh, icon, ...) is carried over untouched. This is a
// stronger basis than the old propsName guess: it replicates a real shipped
// file 1:1 rather than writing to a field nothing seems to read, though it's
// still not verified against the actual running game from here.
//
// issue #141: the SID+text auto-management mechanics (three near-identical
// copies of it below, for name/description/motto) moved into
// useLocalizedTextField/LocalizedTextField once a second dialog
// (HeroEditorDialog) needed the exact same behavior for its own
// name/description/motto fields — same mechanics, same visible copy, just
// no longer duplicated.

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { MapEntity } from '@/types/map-context'
import { saveMapFile } from '@/lib/map-save'
import { mintCustomHeroSid } from '@/lib/zip-export'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useLocalizedTextField } from '@/hooks/useLocalizedTextField'
import LocalizedTextField from '@/components/common/LocalizedTextField'

interface SetDisplayNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The entity whose object gets the display name. Dialog renders nothing when null. */
  entity: MapEntity | null
  mapFilePath: string | null
  /** Every known entity SID and localization SID — used to avoid a generated
   *  or manually-typed SID colliding with anything else. */
  existingSids: string[]
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export default function SetDisplayNameDialog({
  open,
  onOpenChange,
  entity,
  mapFilePath,
  existingSids,
}: SetDisplayNameDialogProps) {
  const localization = useScenarioStore((s) => s.localization)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)
  const removeLocalizationToken = useScenarioStore((s) => s.removeLocalizationToken)
  const renameLocalizationToken = useScenarioStore((s) => s.renameLocalizationToken)
  const customHeroes = useScenarioStore((s) => s.customHeroes)
  const setCustomHero = useScenarioStore((s) => s.setCustomHero)
  const removeCustomHero = useScenarioStore((s) => s.removeCustomHero)
  const mapName = useScenarioStore((s) => s.mapName)
  const catalog = useCatalogStore((s) => s.catalog)

  const [autoManageLoc, setAutoManageLoc] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isHero = entity?.source === 'heroSpawner'

  // ── Hero base definition (issue #139) ───────────────────────────────────────
  // The clone template: an already-customized hero's own stored definition if
  // this spawner has one, else the raw hero JSON straight from the catalog.
  const currentHeroSid = isHero ? (entity?.heroSid ?? '') : ''
  const existingCustomHero = currentHeroSid ? customHeroes[currentHeroSid] : undefined
  const baseHeroSid = existingCustomHero?.sourceHeroSid ?? currentHeroSid
  const baseCatalogHero = catalog?.heroes.find((h) => h.id === baseHeroSid)
  const heroBaseDefinition: Record<string, unknown> | null =
    existingCustomHero?.definition ?? baseCatalogHero?.raw ?? null
  // A hero-spawner entity always resolves to *some* heroSid when a hero is
  // actually assigned (see map-extract.ts) — an empty one means the spawner's
  // hero slot is random/unset, which this dialog has nothing to clone.
  const heroHasNoBase = isHero && !currentHeroSid
  const heroCatalogMissing = isHero && !!currentHeroSid && !heroBaseDefinition
  const heroDisplayName = (sid: string) => catalog?.heroes.find((h) => h.id === sid)?.name ?? sid

  const previousSid = isHero ? str(heroBaseDefinition?.name) : (entity?.displayName ?? '')
  const previousDescSid = isHero ? str(heroBaseDefinition?.description) : (entity?.description ?? '')
  const previousMottoSid = isHero ? str(heroBaseDefinition?.motto) : ''

  // Hooks must run unconditionally (before the `if (!entity) return null`
  // below), so previousSid/previousDescSid/previousMottoSid above use
  // optional chaining rather than assuming `entity` is set yet.
  const nameField = useLocalizedTextField({
    autoManageLoc,
    existingSids: existingSids.filter((s) => s !== previousSid),
  })
  const descField = useLocalizedTextField({
    autoManageLoc,
    existingSids: existingSids.filter((s) => s !== previousDescSid),
    suffix: 'desc_sid',
    optional: true,
  })
  const mottoField = useLocalizedTextField({
    autoManageLoc,
    existingSids: existingSids.filter((s) => s !== previousMottoSid),
    suffix: 'motto_sid',
    optional: true,
  })

  useEffect(() => {
    if (open && entity) {
      nameField.reset(previousSid, previousSid ? (localization[previousSid] ?? '') : '')
      descField.reset(previousDescSid, previousDescSid ? (localization[previousDescSid] ?? '') : '')
      mottoField.reset(previousMottoSid, previousMottoSid ? (localization[previousMottoSid] ?? '') : '')
      // Default matches what's already true of the current value: no prior
      // value, or a prior value already backed by a real token, means this
      // dialog should keep managing it. A prior value with NO token (raw
      // literal text, e.g. written before issue #132's fix, or previously
      // saved with this box unchecked) stays unmanaged until the user opts
      // back in — reopening the dialog must never silently upgrade it.
      // Heroes always start auto-managed (issue #139: nothing to "unmanage"
      // yet the first time a hero is customized).
      setAutoManageLoc(isHero || !previousSid || previousSid in localization)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entity])

  if (!entity) return null

  const isFirstTime = !previousSid

  const handleAutoManageChange = (checked: boolean) => {
    setAutoManageLoc(checked)
    if (checked) {
      nameField.setTextIfEmpty(localization[nameField.sidValue] ?? '')
      descField.setTextIfEmpty(localization[descField.sidValue] ?? '')
      mottoField.setTextIfEmpty(localization[mottoField.sidValue] ?? '')
    }
  }

  const isDuplicateSid =
    nameField.trimmedSid !== previousSid && nameField.trimmedSid !== '' && existingSids.includes(nameField.trimmedSid)
  const isDuplicateDescSid =
    isHero && descField.trimmedSid !== previousDescSid && descField.trimmedSid !== '' && existingSids.includes(descField.trimmedSid)
  const isDuplicateMottoSid =
    isHero && mottoField.trimmedSid !== previousMottoSid && mottoField.trimmedSid !== '' && existingSids.includes(mottoField.trimmedSid)

  const currentText = previousSid ? (localization[previousSid] ?? '') : ''
  const currentDescText = previousDescSid ? (localization[previousDescSid] ?? '') : ''
  const currentMottoText = previousMottoSid ? (localization[previousMottoSid] ?? '') : ''
  const nameUnchanged = autoManageLoc
    ? nameField.trimmedSid === previousSid && nameField.trimmedText === currentText
    : nameField.trimmedSid === previousSid
  const descUnchanged = !isHero || (autoManageLoc
    ? descField.trimmedSid === previousDescSid && descField.trimmedText === currentDescText
    : descField.trimmedSid === previousDescSid)
  const mottoUnchanged = !isHero || (autoManageLoc
    ? mottoField.trimmedSid === previousMottoSid && mottoField.trimmedText === currentMottoText
    : mottoField.trimmedSid === previousMottoSid)
  const isUnchanged = nameUnchanged && descUnchanged && mottoUnchanged

  const isEmpty = nameField.trimmedSid === ''
  const canSave =
    !isEmpty &&
    !isUnchanged &&
    !isDuplicateSid &&
    !isDuplicateDescSid &&
    !isDuplicateMottoSid &&
    !!mapFilePath &&
    !(isHero && (heroHasNoBase || heroCatalogMissing))

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
    if (!mapFilePath || !canSave) return
    setSaving(true)
    setError(null)
    try {
      const entityType = Number(entity.type)
      if (!Number.isFinite(entityType)) {
        throw new Error(`Entity has a non-numeric type ("${entity.type}") — cannot target it`)
      }
      if (isHero) {
        if (!heroBaseDefinition) {
          throw new Error('No base hero definition to clone from — load the Core.zip catalog and try again.')
        }
        const heroSidForClone = existingCustomHero
          ? existingCustomHero.heroSid
          : mintCustomHeroSid(mapName, [...Object.keys(customHeroes), ...(catalog?.heroes.map((h) => h.id) ?? [])])

        const definition: Record<string, unknown> = {
          ...heroBaseDefinition,
          id: heroSidForClone,
          name: nameField.trimmedSid,
          description: descField.trimmedSid,
          motto: mottoField.trimmedSid,
        }

        await saveMapFile(mapFilePath, {
          kind: 'setHeroSid',
          entityType,
          entityId: entity.id,
          heroSid: heroSidForClone,
        })

        setCustomHero(heroSidForClone, {
          heroSid: heroSidForClone,
          sourceHeroSid: baseHeroSid,
          definition,
        })

        if (autoManageLoc) {
          manageToken(previousSid, nameField.trimmedSid, nameField.trimmedText)
          manageToken(previousDescSid, descField.trimmedSid, descField.trimmedText)
          manageToken(previousMottoSid, mottoField.trimmedSid, mottoField.trimmedText)
        }
      } else if (entity.isCitySpawner) {
        await saveMapFile(mapFilePath, {
          kind: 'setCityName',
          entityType,
          entityId: entity.id,
          customCityName: nameField.trimmedSid,
        })
        if (autoManageLoc) manageToken(previousSid, nameField.trimmedSid, nameField.trimmedText)
      } else {
        await saveMapFile(mapFilePath, {
          kind: 'setDisplayName',
          entityType,
          entityId: entity.id,
          nameTitle: nameField.trimmedSid,
        })
        if (autoManageLoc) manageToken(previousSid, nameField.trimmedSid, nameField.trimmedText)
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleRevert = async () => {
    if (!mapFilePath || !existingCustomHero) return
    setReverting(true)
    setError(null)
    try {
      const entityType = Number(entity.type)
      await saveMapFile(mapFilePath, {
        kind: 'setHeroSid',
        entityType,
        entityId: entity.id,
        heroSid: existingCustomHero.sourceHeroSid,
      })
      removeCustomHero(existingCustomHero.heroSid)
      if (previousSid) removeLocalizationToken(previousSid)
      if (previousDescSid) removeLocalizationToken(previousDescSid)
      if (previousMottoSid) removeLocalizationToken(previousMottoSid)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReverting(false)
    }
  }

  const nameLabel = entity.isCitySpawner ? 'City name' : isHero ? 'Hero name' : 'Display name'
  const dialogTitle = entity.isCitySpawner ? 'Set city name' : isHero ? 'Set hero identity' : 'Set display name'
  const busy = saving || reverting

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isHero && (heroHasNoBase || heroCatalogMissing) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                {heroHasNoBase
                  ? "This spawner has no hero assigned yet — assign one first, then reopen this dialog."
                  : 'Load the Core.zip catalog (Game Database) to look up and clone this hero\'s base definition.'}
              </AlertDescription>
            </Alert>
          )}

          {isHero && heroBaseDefinition && (
            <>
              <Alert className="border-amber-600/50 bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
                <AlertDescription className="ml-2">
                  This clones {heroDisplayName(baseHeroSid)}'s hero definition under a new hero SID and
                  edits only name/description/motto on the clone — mesh, mounts, icon, stats, squad, skills,
                  and magics stay exactly as {heroDisplayName(baseHeroSid)}'s.
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground">
                Based on: <span className="font-medium text-foreground">{heroDisplayName(baseHeroSid)}</span>
                {existingCustomHero && ' (already customized)'}
              </p>
            </>
          )}

          {!isHero || heroBaseDefinition ? (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="set-display-name-auto-loc"
                  checked={autoManageLoc}
                  onCheckedChange={(c) => handleAutoManageChange(c === true)}
                />
                <Label htmlFor="set-display-name-auto-loc" className="cursor-pointer text-sm">
                  Automatically manage {isHero ? "these SIDs'" : "this SID's"} localization text
                </Label>
              </div>

              <LocalizedTextField
                idPrefix="set-display-name"
                managedSidLabel="Naming SID"
                unmanagedLabel={`${nameLabel} (written directly, no localization)`}
                sidLabelSuffix={<> for <span className="font-mono">{entity.sid}</span></>}
                textLabel={`${nameLabel} text`}
                sidValue={nameField.sidValue}
                textValue={nameField.textValue}
                autoManageLoc={autoManageLoc}
                onSidChange={nameField.handleSidChange}
                onTextChange={nameField.handleTextChange}
                isDuplicate={isDuplicateSid}
                showFirstTimeNote={isFirstTime}
                autoFocus
              />

              {isHero && (
                <>
                  <LocalizedTextField
                    idPrefix="set-display-name-desc"
                    managedSidLabel="Description SID"
                    unmanagedLabel="Description (written directly, no localization)"
                    textLabel="Description text"
                    sidValue={descField.sidValue}
                    textValue={descField.textValue}
                    autoManageLoc={autoManageLoc}
                    onSidChange={descField.handleSidChange}
                    onTextChange={descField.handleTextChange}
                    isDuplicate={isDuplicateDescSid}
                    optional
                    bordered
                  />

                  <LocalizedTextField
                    idPrefix="set-display-name-motto"
                    managedSidLabel="Motto SID"
                    unmanagedLabel="Motto (written directly, no localization)"
                    textLabel="Motto text"
                    sidValue={mottoField.sidValue}
                    textValue={mottoField.textValue}
                    autoManageLoc={autoManageLoc}
                    onSidChange={mottoField.handleSidChange}
                    onTextChange={mottoField.handleTextChange}
                    isDuplicate={isDuplicateMottoSid}
                    optional
                    bordered
                  />
                </>
              )}
            </>
          ) : null}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            Writes directly to the loaded <code>.map</code> file. A one-time backup
            is kept at <code>.map.bak</code> next to it.
          </p>
        </div>

        <DialogFooter>
          {isHero && existingCustomHero && (
            <Button
              variant="ghost"
              className="mr-auto text-muted-foreground"
              onClick={handleRevert}
              disabled={busy}
            >
              {reverting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Revert to {heroDisplayName(existingCustomHero.sourceHeroSid)}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || busy}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save to .map
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
