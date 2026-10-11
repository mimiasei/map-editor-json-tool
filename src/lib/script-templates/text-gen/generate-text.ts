import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { PHRASES, type LineKind, type Tone } from './phrases'

/** Plain-language pieces substituted into the phrase slots. */
export interface QuestTextParts {
  /** Who is asking, e.g. "the Hermit". */
  giver: string
  /** What the hero must do, as a sentence fragment: "Bring 500 gold". */
  task: string
  /** What the hero gets, as a noun phrase: "300 gold". */
  reward: string
}

export interface GeneratedQuestText {
  title: string
  desc: string
  intro: string
  success: string
}

const KINDS: LineKind[] = ['title', 'desc', 'intro', 'success']

function fill(template: string, parts: QuestTextParts): string {
  const filled = template
    .replace(/\{giver\}/g, parts.giver)
    .replace(/\{task\}/g, parts.task)
    .replace(/\{reward\}/g, parts.reward)
  // A slot at the start of a sentence ("the Dragon Scale for your trouble") needs its capital.
  return filled.replace(/(^|[.!?] )([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase())
}

/** Same (tone, parts, seed) always gives the same text. */
export function generateQuestText(tone: Tone, parts: QuestTextParts, seed: number): GeneratedQuestText {
  const rng = createSeededRng(seed)
  const out = {} as GeneratedQuestText
  for (const kind of KINDS) {
    const options = PHRASES[tone][kind]
    out[kind] = fill(options[Math.floor(rng() * options.length)], parts)
  }
  return out
}

/** "E_Hero_Gingertail" / "art_dragon_scale" -> "Gingertail" / "Dragon Scale". */
export function humanizeSid(sid: string): string {
  const stripped = sid.replace(/^(E_|art_|artifact_|hero_|squad_)/i, '').replace(/^hero_/i, '')
  return stripped
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
