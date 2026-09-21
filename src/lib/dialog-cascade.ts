// ─── Dialog action cascade-delete ──────────────────────────────────────────────
// Deleting a "Show Dialog"-family action used to be a plain array splice — the
// dialog(s) it pointed to, and their localization tokens, were left orphaned in
// useScenarioStore's `dialogs`/`localization` forever. This computes what's safe
// to cascade-delete alongside such an action: only the dialog(s) directly
// referenced by *this* action, and only if nothing else in the project still
// references them (scoped to direct references — a dialog reachable only via
// the deleted dialog's own nested actions is deliberately left alone, since
// recursing further risks deleting more than one click should account for).

import type { Action, ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import type { MapEntity } from '@/types/map-context'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'
import type { CustomBuffDefinition } from '@/types/custom-buff'
import { ACTION_REGISTRY } from '@/schema/actions'

export interface DialogActionCascade {
  /** Dialog ids referenced by this action, safe to delete (unused elsewhere). */
  dialogsToDelete: string[]
  /** Dialog ids referenced by this action, but still used elsewhere — kept. */
  dialogsKept: string[]
  /** Localization sids belonging only to dialogsToDelete, unused elsewhere. */
  tokensToDelete: string[]
}

export interface CascadeScanContext {
  scenario: ScenarioFile
  dialogs: Record<string, DialogFlow>
  customHeroes: Record<string, CustomHeroDefinition>
  customMapObjects: Record<string, CustomMapObjectDefinition>
  customArtifacts: Record<string, CustomArtifactDefinition>
  customBuffs: Record<string, CustomBuffDefinition>
  /** Entities extracted from the currently-loaded .map file, if any — absent
   *  (no map open this session) degrades the scan gracefully rather than
   *  blocking or throwing; see describeDialogActionCascade's caveat line. */
  mapEntities: MapEntity[] | undefined
}

type ActionLike = { a: string; p?: string[] }

/** Every `p[]` index this action type marks as a dialog-sid reference. */
function dialogRefIndices(a: string): number[] {
  const def = ACTION_REGISTRY[a]
  if (!def) return []
  return def.params.reduce<number[]>((idxs, param, i) => {
    if (param.ref === 'dialog') idxs.push(i)
    return idxs
  }, [])
}

/** Every action array a dialog-referencing action could live in — mirrors
 *  entity-usage.ts's buildEntityUsageMap traversal shape, but (unlike that
 *  generic table) filters to only the ref:'dialog'-flagged param index of
 *  each of the 10 dialog action types, so an unrelated hero/counter/quest sid
 *  that happens to equal a dialog id never counts as "still in use". */
function* allActionArrays(scenario: ScenarioFile, dialogs: Record<string, DialogFlow>): Generator<ActionLike[]> {
  for (const quest of scenario.quests) {
    for (const sq of quest.subQuests) {
      for (const trigger of sq.triggers) yield trigger.actions
    }
  }
  for (const intr of scenario.interruptions) yield intr.actions
  for (const flow of Object.values(dialogs)) {
    for (const slide of flow.slides) {
      if (slide.actions) yield slide.actions
      if (slide.closeActions) yield slide.closeActions
      if (slide.mapActions) yield slide.mapActions
      if (slide.closeMapActions) yield slide.closeMapActions
      for (const answer of slide.answers ?? []) {
        yield answer.actions
        if (answer.mapActions) yield answer.mapActions
      }
    }
  }
}

/** Dialog ids from `candidateIds` still referenced by some action other than
 *  `excluded` (compared by object identity — every call site in this
 *  codebase passes the same array-element object through unmodified, never a
 *  clone, so this reliably identifies "the one instance being removed"
 *  without needing to thread a quest/trigger/slide path through). */
function usedDialogIds(
  candidateIds: Set<string>,
  excluded: Action,
  scenario: ScenarioFile,
  dialogs: Record<string, DialogFlow>,
): Set<string> {
  const used = new Set<string>()
  for (const actions of allActionArrays(scenario, dialogs)) {
    for (const action of actions) {
      if (action === excluded) continue
      for (const idx of dialogRefIndices(action.a)) {
        const id = action.p?.[idx]
        if (id && candidateIds.has(id)) used.add(id)
      }
    }
  }
  return used
}

function collectFlowTokens(flow: DialogFlow): Set<string> {
  const tokens = new Set<string>()
  for (const slide of flow.slides) {
    if (slide.text) tokens.add(slide.text)
    if (slide.title?.sid) tokens.add(slide.title.sid)
    for (const answer of slide.answers ?? []) {
      if (answer.text) tokens.add(answer.text)
    }
  }
  return tokens
}

function fieldStrings(sources: Record<string, unknown>[], fields: string[]): string[] {
  const values: string[] = []
  for (const source of sources) {
    for (const field of fields) {
      const v = source[field]
      if (typeof v === 'string' && v) values.push(v)
    }
  }
  return values
}

/** Every localization sid `flow` doesn't own but the rest of the project
 *  still does — everything except the dialogs about to be deleted (so a
 *  token shared only between two simultaneously-orphaned RandomDialog
 *  branches is still correctly deletable), plus quest/subquest text, custom
 *  entity display fields, and (best-effort) the loaded map's own entity
 *  naming sids. */
function tokensStillUsedElsewhere(
  dialogsBeingDeleted: Set<string>,
  ctx: CascadeScanContext,
): Set<string> {
  const used = new Set<string>()

  for (const [id, flow] of Object.entries(ctx.dialogs)) {
    if (dialogsBeingDeleted.has(id)) continue
    for (const sid of collectFlowTokens(flow)) used.add(sid)
  }

  for (const quest of ctx.scenario.quests) {
    if (quest.name) used.add(quest.name)
    if (quest.desc) used.add(quest.desc)
    for (const sq of quest.subQuests) {
      if (sq.name) used.add(sq.name)
    }
  }

  for (const v of fieldStrings(Object.values(ctx.customHeroes).map((h) => h.definition), ['name', 'description', 'motto'])) used.add(v)
  for (const v of fieldStrings(Object.values(ctx.customMapObjects).map((o) => o.template), ['name', 'description', 'narrativeDescription'])) used.add(v)
  for (const v of fieldStrings(Object.values(ctx.customArtifacts).map((a) => a.template), ['name', 'description', 'narrativeDescription', 'upgradeDescription'])) used.add(v)
  for (const v of fieldStrings(Object.values(ctx.customBuffs).map((b) => b.template), ['name_', 'description_'])) used.add(v)

  // Mirrors LocalizationDialog.tsx's own (known-imperfect) nsidToOwnerSid
  // convention: a MapEntity's displayName/description can literally be
  // "LOC:<sid>" rather than the bare sid — this compares the raw value, same
  // as that existing precedent, rather than silently fixing the prefix
  // handling as a side effect of this feature.
  for (const e of ctx.mapEntities ?? []) {
    if (e.displayName) used.add(e.displayName)
    if (e.description) used.add(e.description)
  }

  return used
}

export function computeDialogActionCascade(action: Action, ctx: CascadeScanContext): DialogActionCascade {
  const refIndices = dialogRefIndices(action.a)
  if (refIndices.length === 0) {
    return { dialogsToDelete: [], dialogsKept: [], tokensToDelete: [] }
  }

  const candidateIds = new Set<string>()
  for (const idx of refIndices) {
    const id = action.p?.[idx]
    if (id) candidateIds.add(id)
  }
  if (candidateIds.size === 0) {
    return { dialogsToDelete: [], dialogsKept: [], tokensToDelete: [] }
  }

  const stillUsed = usedDialogIds(candidateIds, action, ctx.scenario, ctx.dialogs)
  const dialogsToDelete: string[] = []
  const dialogsKept: string[] = []
  for (const id of candidateIds) {
    if (stillUsed.has(id)) dialogsKept.push(id)
    else if (ctx.dialogs[id]) dialogsToDelete.push(id)
  }

  if (dialogsToDelete.length === 0) {
    return { dialogsToDelete, dialogsKept, tokensToDelete: [] }
  }

  const candidateTokens = new Set<string>()
  for (const id of dialogsToDelete) {
    for (const sid of collectFlowTokens(ctx.dialogs[id])) candidateTokens.add(sid)
  }

  const elsewhere = tokensStillUsedElsewhere(new Set(dialogsToDelete), ctx)
  const tokensToDelete = Array.from(candidateTokens).filter((sid) => !elsewhere.has(sid))

  return { dialogsToDelete, dialogsKept, tokensToDelete }
}

export function describeDialogActionCascade(
  cascade: DialogActionCascade,
  mapLoaded: boolean,
): string {
  const lines = ['Deleting this action will also delete:']
  if (cascade.dialogsToDelete.length > 0) {
    lines.push(`• Dialog(s): ${cascade.dialogsToDelete.join(', ')}`)
  }
  if (cascade.tokensToDelete.length > 0) {
    const owner = cascade.dialogsToDelete.length === 1 ? 'it' : 'these dialogs'
    lines.push(`• ${cascade.tokensToDelete.length} localization token(s) used only by ${owner}`)
  }
  lines.push('', 'This cannot be undone with Ctrl+Z.')
  if (!mapLoaded) {
    lines.push('(No map is loaded this session, so map object names/descriptions weren’t checked.)')
  }
  return lines.join('\n')
}
