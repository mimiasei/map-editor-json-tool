// Story-state checks: counters that are read but never set (or the reverse),
// and dialog/token ids that are not prefixed with the map name. Returns the
// same shape as validateScenario, which merges it in.

import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import { mapNameSnakeCase } from '@/lib/zip-export'
import i18n from '@/lib/i18n'

interface Msg {
  path: string
  message: string
}
interface Result {
  errors: Msg[]
  warnings: Msg[]
}

type Act = { a: string; p?: string[] }
type Cond = { c: string; p?: string[] }

const COUNTER_WRITE_ACTIONS = new Set(['CounterPlus', 'CounterMinus', 'CounterSet', 'CounterSetRandom'])
const COUNTER_READ_CONDITIONS = new Set(['Counter', 'CounterEqualityInDays'])
const COUNTER_READ_DIALOG_ACTIONS = new Set(['DialogIfCounter'])

function collectActions(scenario: ScenarioFile, dialogs: Record<string, DialogFlow>): Act[] {
  const out: Act[] = []
  for (const quest of scenario.quests)
    for (const sub of quest.subQuests)
      for (const trigger of sub.triggers) out.push(...trigger.actions)
  for (const i of scenario.interruptions) out.push(...i.actions)
  for (const flow of Object.values(dialogs)) {
    for (const slide of flow.slides) {
      out.push(...(slide.mapActions ?? []), ...(slide.closeMapActions ?? []))
      for (const answer of slide.answers ?? []) out.push(...(answer.mapActions ?? []))
    }
  }
  return out
}

function collectConditions(scenario: ScenarioFile): Cond[] {
  const out: Cond[] = []
  for (const quest of scenario.quests)
    for (const sub of quest.subQuests)
      for (const trigger of sub.triggers) out.push(...trigger.conditions)
  return out
}

export function validateStoryState(
  scenario: ScenarioFile,
  extras: { mapName?: string; dialogs?: Record<string, DialogFlow> },
): Result {
  const errors: Msg[] = []
  const warnings: Msg[] = []
  const dialogs = extras.dialogs ?? {}

  const actions = collectActions(scenario, dialogs)
  const conditions = collectConditions(scenario)

  const written = new Set<string>()
  const read = new Set<string>()
  for (const a of actions) {
    if (COUNTER_WRITE_ACTIONS.has(a.a) && a.p?.[0]) written.add(a.p[0])
    // DialogIfCounter params: [dialogSid, counterSid, op, value]
    if (COUNTER_READ_DIALOG_ACTIONS.has(a.a) && a.p?.[1]) read.add(a.p[1])
  }
  for (const c of conditions) {
    if (!COUNTER_READ_CONDITIONS.has(c.c)) continue
    if (c.p?.[0]) read.add(c.p[0])
  }
  // CompareCounters reads two counters.
  for (const c of conditions) {
    if (c.c === 'CompareCounters') {
      if (c.p?.[0]) read.add(c.p[0])
      if (c.p?.[2]) read.add(c.p[2])
    }
  }
  // Answers can gate on a counter through their own conditions.
  for (const flow of Object.values(dialogs))
    for (const slide of flow.slides)
      for (const answer of slide.answers ?? [])
        for (const r of answer.requests ?? []) if (r.c === 'Counter' && r.p?.[0]) read.add(r.p[0])

  for (const [i, counter] of scenario.counters.entries()) {
    const path = `Counter[${i}] "${counter.sid}"`
    if (read.has(counter.sid) && !written.has(counter.sid) && counter.value === 0) {
      warnings.push({
        path,
        message: i18n.t('validate.story.counterIsCheckedButNothing'),
      })
    }
    if (written.has(counter.sid) && !read.has(counter.sid)) {
      warnings.push({ path, message: i18n.t('validate.story.counterIsChangedButNever') })
    }
  }

  // Dialog and token ids share one global pool across addon zips (CLAUDE.md).
  const mapName = extras.mapName?.trim()
  if (mapName) {
    const prefix = `${mapNameSnakeCase(mapName)}_`
    const unprefixed = Object.keys(dialogs).filter((id) => !id.startsWith(prefix))
    if (unprefixed.length > 0) {
      const sample = unprefixed.slice(0, 3).join(', ')
      warnings.push({
        path: 'Dialogs',
        message: i18n.t('validate.story.unprefixedDialogIds', { count: unprefixed.length, prefix, sample }),
      })
    }
  }

  return { errors, warnings }
}
