// ─── H3 global timed events → OE quest+dialog ────────────────────────────────
// H3's "Specify Timed Events" map-editor feature (an event fires on a given
// day, optionally shows a message and/or grants resources to the affected
// players) — the mechanism behind the message many maps open with on day 1.
// Fully parsed already (`h3m-global-events.ts`'s `H3mGlobalTimedEvent`), but
// never previously consumed anywhere in this importer — collected then
// dropped. This mirrors `victory.ts`'s own precedent exactly (hand-typed
// Quest/Trigger/Condition/Action interfaces, no Zod dependency, so this
// module runs standalone in this project's own bundle-and-verify scripts):
// one quest per event, a `StartTurn` condition for the day it fires, a
// `Dialog` action for its message (text registered as a real localization
// token — never written as literal text, see `slugify.ts`'s own doc comment
// on why), and a `GiveRes` action per nonzero resource amount.
//
// Deliberately simplified: only the event's FIRST occurrence is converted
// (`firstOccurrence`/`triggerDay`) — H3's own `nextOccurrence` repeat gap
// isn't modeled as a recurring trigger this round, matching the "day 1
// greeting" use case this was built for; a repeating event still gets its
// first real message, just not later re-fires. Also: this importer only
// ever tracks a single human player (see `ownership.ts`'s own doc comment),
// so an event is converted whenever `humanAffected` isn't POSITIVELY false
// (SoD+ maps only carry this flag at all — RoE/AB have no way to tell, so
// those are always converted rather than silently dropped).

import type { H3mGlobalTimedEvent } from './h3m-global-events'
import { generateDisplayNameSid } from '@/lib/slugify'
import type { DialogFlow } from '@/types/dialog'

interface QuestCondition { comment: string; p: string[]; counter: number; c: string }
interface QuestAction { comment: string; p: string[]; a: string }
interface QuestTrigger { comment: string; repeat: boolean; conditions: QuestCondition[]; actions: QuestAction[]; conditionsLogic: string }
interface SubQuest { sid: string; activeOnStart: boolean; hidden: boolean; name: string; desc: string; comment: string; triggers: QuestTrigger[] }
export interface GlobalEventQuest {
  sid: string; activeOnStart: boolean; comment: string; main: boolean; hidden: boolean
  name: string; desc: string; sharing: string; subQuests: SubQuest[]
}

/** H3M's own resource-array convention (used throughout the format for any
 *  fixed 7-slot resource list — starting resources, treasuries, and this
 *  event's own `resources[]`): Wood, Mercury, Ore, Sulfur, Crystal, Gems,
 *  Gold, index 0-6. Mapped to OE's own resource sids (`src/lib/resources.ts`'s
 *  `BASIC_RESOURCE_IDS`) — OE's "dust" is the sulfur equivalent. */
const RESOURCE_INDEX_TO_OE_SID = [
  'resource_wood', 'resource_mercury', 'resource_ore', 'resource_dust',
  'resource_crystals', 'resource_gemstones', 'resource_gold',
]

/** `StartTurn`'s own documented limit is weeks 1-4 of month 1; beyond that,
 *  its own schema description says to use the `counter` (days-elapsed)
 *  field instead — not a guess, the condition's own real usage guidance. */
function startTurnCondition(triggerDay: number): QuestCondition {
  const week = Math.floor((triggerDay - 1) / 7) + 1
  if (week <= 4) {
    const dayOfWeek = ((triggerDay - 1) % 7) + 1
    return { comment: '', p: [String(week), String(dayOfWeek)], counter: 1, c: 'StartTurn' }
  }
  return { comment: '', p: [], counter: triggerDay, c: 'StartTurn' }
}

export interface GlobalEventConversion {
  quest: GlobalEventQuest
  dialogFlow: DialogFlow
  localizationTokens: Record<string, string>
}

/** `null` when there's nothing to show or give (no message, no resources) —
 *  or when SoD+ data positively confirms the human player isn't affected. */
export function buildGlobalEventQuest(event: H3mGlobalTimedEvent, existingSids: string[]): GlobalEventConversion | null {
  if (event.humanAffected === 0) return null
  const message = event.message.trim()
  const hasResources = event.resources.some((amount) => amount !== 0)
  if (!message && !hasResources) return null

  const questSid = `global_event_${event.index}`
  const dialogId = `global_event_${event.index}_dialog`
  const localizationTokens: Record<string, string> = {}

  const actions: QuestAction[] = []
  if (message) {
    actions.push({ comment: '', p: [dialogId], a: 'Dialog' })
  }
  event.resources.forEach((amount, i) => {
    if (amount === 0) return
    actions.push({ comment: '', p: [RESOURCE_INDEX_TO_OE_SID[i], String(amount)], a: 'GiveRes' })
  })
  actions.push({ comment: '', p: [], a: 'CurrentSubQuestDone' })

  const dialogTextSid = message ? generateDisplayNameSid(message, existingSids, 'dialog_text_sid') : ''
  if (dialogTextSid) localizationTokens[dialogTextSid] = message

  const dialogFlow: DialogFlow = {
    id: dialogId,
    slides: message ? [{ id: '1', text: dialogTextSid, end: true }] : [],
  }

  const quest: GlobalEventQuest = {
    sid: questSid,
    activeOnStart: true,
    comment: `H3 import: global timed event "${event.name}" (day ${event.triggerDay})`,
    main: false,
    hidden: true,
    name: event.name || 'H3 event',
    desc: '',
    sharing: 'Clone',
    subQuests: [{
      sid: `${questSid}_sub`,
      activeOnStart: true,
      hidden: true,
      name: event.name || 'H3 event',
      desc: '',
      comment: '',
      triggers: [{
        comment: '',
        repeat: false,
        conditions: [startTurnCondition(event.triggerDay)],
        actions,
        conditionsLogic: 'And',
      }],
    }],
  }

  return { quest, dialogFlow, localizationTokens }
}
