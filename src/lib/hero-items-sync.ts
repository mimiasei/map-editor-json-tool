// Applies the generated starting-artifact pieces (see hero-start-items.ts) to the open project: the scenario's quests
// and interruptions, and the open map's Actions Before/After tables. Called when a hero is saved or removed.

import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapDocumentStore, containerToRawBlocks } from '@/store/useMapDocumentStore'
import { syncHeroStartItems, withSpawnItems } from '@/lib/hero-start-items'

interface RawRow { actions?: { a?: string; p?: string[]; comment?: string }[] }

function actionTables(): { before: RawRow[]; after: RawRow[] } | null {
  const container = useMapDocumentStore.getState().container
  if (!container) return null
  const props = containerToRawBlocks(container).block2?.objectsProperties
  return { before: (props?.propActionsBefore ?? []) as RawRow[], after: (props?.propActionsAfter ?? []) as RawRow[] }
}

export function syncHeroItemsEverywhere(): void {
  const { customHeroes, scenario, mapName } = useScenarioStore.getState()
  const tables = actionTables()
  const mapSpawned = new Set<string>()
  for (const row of [...(tables?.before ?? []), ...(tables?.after ?? [])]) {
    for (const a of row.actions ?? []) if (a.a === 'SpawnHero' && a.p?.[0]) mapSpawned.add(a.p[0])
  }

  const next = syncHeroStartItems(scenario, customHeroes, mapName, mapSpawned)
  if (next !== scenario) useScenarioStore.setState({ scenario: next, isDirty: true })

  if (!tables) return
  for (const which of ['before', 'after'] as const) {
    const rows = tables[which]
    let changed = false
    const synced = rows.map((row) => {
      const actions = withSpawnItems(
        (row.actions ?? []).map((a) => ({ ...a, a: a.a ?? '' })),
        customHeroes,
      )
      if (JSON.stringify(actions) === JSON.stringify(row.actions ?? [])) return row
      changed = true
      return { ...row, actions }
    })
    if (changed) useMapDocumentStore.getState().applyEdit({ kind: 'replaceActionTable', which, rows: synced })
  }
}
