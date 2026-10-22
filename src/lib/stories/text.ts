// Offline English text for a TextSpec: picks a phrase from the banks and fills
// its {slots} from the spec's context. The text writer replaces this output
// when enabled; "Rewrite" without it just rolls another phrase.

import type { TextSpec } from '@/types/story'
import { NARRATIVE, ANSWERS, OUTCOMES } from './phrases'
import type { Tone } from '@/lib/script-templates/text-gen/phrases'

type SpecShape = Pick<TextSpec, 'kind' | 'intent' | 'context'> & { tone: string }

function fill(template: string, vals: Record<string, string>): string {
  const filled = template.replace(/\{(\w+)\}/g, (_, k: string) => vals[k] ?? '')
  // A slot at the start of a sentence needs its capital.
  return filled.replace(/(^|[.!?] )([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase())
}

export function phraseBank(spec: SpecShape): string[] {
  if (spec.kind === 'answer') return ANSWERS[spec.intent ?? 'bold']
  if (spec.kind === 'outcome') return OUTCOMES[spec.intent ?? 'bold']
  const tone = (spec.tone in NARRATIVE ? spec.tone : 'heroic') as Tone
  return NARRATIVE[tone][spec.kind]
}

/** One phrase for the spec, using `rng` (0..1) to pick among the variants. */
export function offlineText(spec: SpecShape, rng: () => number): string {
  const bank = phraseBank(spec)
  return fill(bank[Math.floor(rng() * bank.length)], spec.context)
}
