// ─── H3 victory condition → OE quest script ──────────────────────────────────
// Simplified port of the reference project's `vanilla_stock/victory_events.py`
// WINSTANDARD path (leviritchie/homm3-olden-stock-translator, used with the
// author's explicit permission) — the one victory type common enough on real
// maps to be worth this round's effort. Any other H3 victory type (TAKEMINES,
// GATHERTROOP, BEATHERO, ...) is left with no emitted victory quest this
// round — a real, reportable simplification (see convert-h3m-to-map.ts),
// not a silent guess: the reference's own behavior for an unsupported type
// is to raise rather than invent a fallback, and until Phase 4 grows a
// second real victory-type builder, "no quest" is the honest equivalent for
// an importer that must keep producing output for every input.
//
// Deliberately simplified vs. the reference: only ONE human-capable player
// is supported (this port's ownership.ts only ever tracks a single human,
// always final owner 1 — see its own doc comment), so the emitted quest has
// one subquest, not one per human seat in a hot-seat/multiplayer scenario.

export const MAIN_QUEST_SID = 'MainQuest'

interface QuestCondition { comment: string; p: string[]; counter: number; c: string }
interface QuestAction { comment: string; p: string[]; a: string }
interface QuestTrigger { comment: string; repeat: boolean; conditions: QuestCondition[]; actions: QuestAction[]; conditionsLogic: string }
interface SubQuest { sid: string; activeOnStart: boolean; hidden: boolean; name: string; desc: string; comment: string; triggers: QuestTrigger[] }
export interface MainQuest {
  sid: string; activeOnStart: boolean; comment: string; main: boolean; hidden: boolean
  name: string; desc: string; sharing: string; subQuests: SubQuest[]
}

function playerDefeatedCondition(finalOwner: number): QuestCondition {
  return { comment: '', p: [String(finalOwner)], counter: 1, c: 'PlayerDefeated' }
}

/** `humanFinalOwner` is always `1` under this port's ownership model.
 *  Returns `null` when there are fewer than 2 playable final owners (no one
 *  else to defeat) — the caller should leave the quest chunk empty. */
export function buildWinstandardQuest(mapTitle: string, humanFinalOwner: number, allFinalOwners: number[]): MainQuest | null {
  const others = allFinalOwners.filter((o) => o !== humanFinalOwner)
  if (others.length === 0) return null

  return {
    sid: MAIN_QUEST_SID,
    activeOnStart: true,
    comment: 'H3 import: WINSTANDARD -> DefeatAll + PlayerDefeated -> GameVictory',
    main: true,
    hidden: false,
    name: 'Defeat all enemies',
    desc: `Capture all enemy towns and defeat all enemy heroes on ${mapTitle}.`,
    sharing: 'Clone',
    subQuests: [{
      sid: `MainQuest_defeat_as_p${humanFinalOwner}`,
      activeOnStart: true,
      hidden: false,
      name: 'Defeat all enemies',
      desc: '',
      comment: `WINSTANDARD: native owner ${humanFinalOwner} wins when other playable sides are defeated`,
      triggers: [{
        comment: '',
        repeat: false,
        conditions: others.map(playerDefeatedCondition),
        actions: [
          { comment: '', p: [], a: 'CurrentSubQuestDone' },
          { comment: '', p: [], a: 'GameVictory' },
        ],
        conditionsLogic: 'And',
      }],
    }],
  }
}
