// ─── Starting artifacts for custom heroes ────────────────────────────────────
// The game has no artifact field on a hero (none of the 174 hero definitions in Core.zip has one) and the .map has no
// inventory table. Shipped maps give heroes items with the GiveItemHero action from a StartTurn trigger
// (ascension_to_the_throne.map, infinite_frost.map), so each custom hero's `startArtifacts` list is turned into one
// managed quest that does the same. It is rebuilt from the heroes whenever one changes.

import type { Quest, ScenarioFile, Action } from '@/types/scenario'
import type { CustomHeroDefinition } from '@/types/hero'
import { mapNameSnakeCase } from '@/lib/zip-export'

/** Marks the generated quest so it can be found again (and replaced) after a rename of the map. */
export const HERO_ITEMS_QUEST_COMMENT = 'Generated from the custom heroes\' starting artifacts; edits are overwritten.'

export function buildHeroStartItemsQuest(
  customHeroes: Record<string, CustomHeroDefinition>,
  sid: string,
): Quest | null {
  const actions: Action[] = []
  for (const heroSid of Object.keys(customHeroes).sort()) {
    for (const artifact of customHeroes[heroSid].startArtifacts ?? []) {
      if (artifact.trim()) actions.push({ a: 'GiveItemHero', p: [artifact.trim(), heroSid] })
    }
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
 * The scenario with the managed quest added, replaced or removed to match the heroes. Returns the same object when
 * nothing changes, so an unrelated hero edit does not mark the project dirty.
 */
export function syncHeroStartItems(
  scenario: ScenarioFile,
  customHeroes: Record<string, CustomHeroDefinition>,
  mapName: string,
): ScenarioFile {
  const existingIndex = scenario.quests.findIndex((q) => q.comment === HERO_ITEMS_QUEST_COMMENT)
  let sid = existingIndex >= 0 ? scenario.quests[existingIndex].sid : `${mapNameSnakeCase(mapName)}_hero_start_items`
  if (existingIndex < 0) {
    const taken = new Set(scenario.quests.map((q) => q.sid))
    const base = sid
    for (let n = 2; taken.has(sid); n++) sid = `${base}_${n}`
  }
  const next = buildHeroStartItemsQuest(customHeroes, sid)
  if (existingIndex < 0 && !next) return scenario
  if (existingIndex >= 0 && next && JSON.stringify(scenario.quests[existingIndex]) === JSON.stringify(next)) return scenario
  const quests = [...scenario.quests]
  if (existingIndex >= 0) {
    if (next) quests[existingIndex] = next
    else quests.splice(existingIndex, 1)
  } else if (next) {
    quests.push(next)
  }
  return { ...scenario, quests }
}
