// ─── Starting artifacts for custom heroes ────────────────────────────────────
// The game has no artifact field on a hero (none of the 174 hero definitions in Core.zip has one) and the .map has no
// inventory table. Items are given with the GiveItemHero action, which fails with "Hero by sid ... not found" when the
// hero is not on the map yet (seen in Player.log for a hero created by SpawnHero). So there are two cases:
//   * a hero that is on the map from the start (placed as a spawner): one managed quest gives the items on StartTurn,
//     the way ascension_to_the_throne.map and infinite_frost.map do;
//   * a hero created by a SpawnHero action: the items are given by actions inserted right after that SpawnHero.
// Everything generated is recomputed from `startArtifacts` each time, so edits and removals stay in step.

import type { Action, Quest, ScenarioFile } from '@/types/scenario'
import type { CustomHeroDefinition } from '@/types/hero'
import { mapNameSnakeCase } from '@/lib/zip-export'

/** Marks the generated quest so it can be found again (and replaced) after a rename of the map. */
export const HERO_ITEMS_QUEST_COMMENT = 'Generated from the custom heroes\' starting artifacts; edits are overwritten.'
/** Marks the GiveItemHero actions inserted after a SpawnHero. */
export const HERO_ITEM_ACTION_COMMENT = 'starting artifact (generated)'

type HeroMap = Record<string, CustomHeroDefinition>
interface CommentedAction { a: string; p?: string[]; comment?: string }

const artifactsOf = (heroes: HeroMap, heroSid: string) =>
  (heroes[heroSid]?.startArtifacts ?? []).map((x) => x.trim()).filter(Boolean)

/**
 * The actions with the generated item gifts recomputed: old ones dropped, and one GiveItemHero per starting artifact
 * inserted straight after each SpawnHero of a custom hero. Returns the same array when nothing changes.
 */
export function withSpawnItems<T extends CommentedAction>(actions: T[], heroes: HeroMap): T[] {
  const out: T[] = []
  for (const action of actions) {
    if (action.a === 'GiveItemHero' && action.comment === HERO_ITEM_ACTION_COMMENT) continue
    out.push(action)
    if (action.a !== 'SpawnHero') continue
    const heroSid = action.p?.[0] ?? ''
    for (const artifact of artifactsOf(heroes, heroSid)) {
      out.push({ a: 'GiveItemHero', p: [artifact, heroSid], comment: HERO_ITEM_ACTION_COMMENT } as T)
    }
  }
  const same = out.length === actions.length && out.every((x, i) => x === actions[i])
  return same ? actions : out
}

/** Hero sids that some SpawnHero action creates; they cannot be given items on StartTurn. */
export function spawnedHeroSids(lists: CommentedAction[][]): Set<string> {
  const sids = new Set<string>()
  for (const list of lists) for (const a of list) if (a.a === 'SpawnHero' && a.p?.[0]) sids.add(a.p[0])
  return sids
}

export function buildHeroStartItemsQuest(heroes: HeroMap, sid: string, skip: Set<string> = new Set()): Quest | null {
  const actions: Action[] = []
  for (const heroSid of Object.keys(heroes).sort()) {
    if (skip.has(heroSid)) continue
    for (const artifact of artifactsOf(heroes, heroSid)) actions.push({ a: 'GiveItemHero', p: [artifact, heroSid] })
  }
  if (actions.length === 0) return null
  return {
    sid,
    comment: HERO_ITEMS_QUEST_COMMENT,
    activeOnStart: true,
    sharing: 'Clone',
    subQuests: [
      {
        sid: `${sid}_give`,
        activeOnStart: true,
        triggers: [{ conditionsLogic: 'And', repeat: false, conditions: [{ c: 'StartTurn', p: [] }], actions }],
      },
    ],
  }
}

/**
 * The scenario with its generated pieces matching the heroes: the day-1 quest (for heroes not created by SpawnHero)
 * added, replaced or removed, and the item gifts after every SpawnHero in quests and interruptions. Returns the same
 * object when nothing changes, so an unrelated edit does not mark the project dirty. `mapSpawned` are heroes that the
 * map's own zone/object actions spawn.
 */
export function syncHeroStartItems(
  scenario: ScenarioFile,
  heroes: HeroMap,
  mapName: string,
  mapSpawned: Set<string> = new Set(),
): ScenarioFile {
  let changed = false
  const quests = scenario.quests.map((q) => {
    if (q.comment === HERO_ITEMS_QUEST_COMMENT) return q
    const subQuests = q.subQuests.map((sq) => {
      const triggers = sq.triggers.map((t) => {
        const actions = withSpawnItems(t.actions, heroes)
        return actions === t.actions ? t : { ...t, actions }
      })
      return triggers.every((t, i) => t === sq.triggers[i]) ? sq : { ...sq, triggers }
    })
    if (subQuests.every((sq, i) => sq === q.subQuests[i])) return q
    changed = true
    return { ...q, subQuests }
  })
  const interruptions = scenario.interruptions.map((it) => {
    const actions = withSpawnItems(it.actions, heroes)
    if (actions === it.actions) return it
    changed = true
    return { ...it, actions }
  })

  const spawned = spawnedHeroSids([
    ...mapSpawned.size > 0 ? [[...mapSpawned].map((p) => ({ a: 'SpawnHero', p: [p] }))] : [],
    ...quests.flatMap((q) => q.subQuests.flatMap((sq) => sq.triggers.map((t) => t.actions))),
    ...interruptions.map((it) => it.actions),
  ])

  const existingIndex = quests.findIndex((q) => q.comment === HERO_ITEMS_QUEST_COMMENT)
  let sid = existingIndex >= 0 ? quests[existingIndex].sid : `${mapNameSnakeCase(mapName)}_hero_start_items`
  if (existingIndex < 0) {
    const taken = new Set(quests.map((q) => q.sid))
    const base = sid
    for (let n = 2; taken.has(sid); n++) sid = `${base}_${n}`
  }
  const next = buildHeroStartItemsQuest(heroes, sid, spawned)
  const current = existingIndex >= 0 ? quests[existingIndex] : null
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    changed = true
    if (existingIndex >= 0) {
      if (next) quests[existingIndex] = next
      else quests.splice(existingIndex, 1)
    } else if (next) {
      quests.push(next)
    }
  }
  return changed ? { ...scenario, quests, interruptions } : scenario
}
