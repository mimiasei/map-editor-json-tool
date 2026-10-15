// ─── Decoration sid parsing ───────────────────────────────────────────────────
// Splits an `environments` sid into the three parts the biome decoration mix
// rules (rmg/biome-decoration-mix.ts) match on: type, variant and number.
//
//   tree_dead_5        -> { type: 'tree',     variant: 'dead',     num: 5 }
//   pinetree_snow_2    -> { type: 'tree',     variant: 'pine_snow', num: 2 }
//   mountain_dirt_big_3 -> { type: 'mountain', variant: 'dirt_big', num: 3 }
//   mountain_lava_big_2wl -> { type: 'mountain', variant: 'lava_big_wl', num: 2 }
//   grass_stones_1     -> { type: 'stones',   variant: 'grass',    num: 1 }
//   hill_big           -> { type: 'hill',     variant: 'big' }          (no number)
//
// The biome is NOT part of the sid: it comes from the catalog entry's own
// `biome` field (the variant word `dead` in `tree_dead_5` is just a name).

export interface ParsedDecorationSid {
  type: string
  /** Everything between the type and the number, `_`-joined ('' when there is none). */
  variant: string
  /** Trailing number, undefined for one-off objects such as `hill_big`. */
  num?: number
}

/** Types matched by the LAST word of the sid, e.g. `dead_stones_1` is stones, not "dead". */
const LAST_WORD_TYPES = new Set(['stones', 'hill', 'rock'])

/** First word -> canonical type (and the variant word it contributes). The rest
 *  of the sid keeps its words as the variant: `pinetree_snow` -> tree / pine_snow. */
const FIRST_WORD_ALIASES: Record<string, { type: string; variant?: string }> = {
  pinetree: { type: 'tree', variant: 'pine' },
  palms: { type: 'tree', variant: 'palm' },
  snag: { type: 'tree', variant: 'snag' },
  rocks: { type: 'rock' },
  three: { type: 'sculls' }, // "three_sculls" is a typo in the game data
}

/** Per-sid exceptions the two rules above get wrong. Keyed by the sid WITHOUT
 *  its trailing number; add a line here when `scripts/list-decoration-pools.ts`
 *  shows an object parsed into a type or variant you do not want. */
export const SID_OVERRIDES: Record<string, Partial<Pick<ParsedDecorationSid, 'type' | 'variant'>>> = {
  dead_burials_tree: { type: 'tree', variant: 'burials' },
}

export function parseDecorationSid(sid: string): ParsedDecorationSid {
  // `lava_big_1wl` -> `lava_big_wl_1`, so the number is the last word like everywhere else.
  const normalized = sid.replace(/_(\d+)wl$/, '_wl_$1')
  const match = /^(.*?)(?:_(\d+))?$/.exec(normalized)
  const base = match?.[1] ?? normalized
  const num = match?.[2] === undefined ? undefined : Number(match[2])
  const withNum = (type: string, variant: string): ParsedDecorationSid => (num === undefined ? { type, variant } : { type, variant, num })

  const override = SID_OVERRIDES[base]
  const words = base.split('_')
  let type = words[0]
  let variantWords = words.slice(1)

  const last = words[words.length - 1]
  if (words.length > 1 && LAST_WORD_TYPES.has(last)) {
    type = last
    variantWords = words.slice(0, -1)
  } else if (FIRST_WORD_ALIASES[type]) {
    const alias = FIRST_WORD_ALIASES[type]
    type = alias.type
    variantWords = alias.variant ? [alias.variant, ...variantWords] : variantWords
  }
  return withNum(override?.type ?? type, override?.variant ?? variantWords.join('_'))
}

/** What a rule selects. Every field is optional; an omitted field matches anything. */
export interface DecorationMatcher {
  /** Parsed type, e.g. 'tree', 'mountain', 'grass', 'hill', 'stones', 'rock'. One or several. */
  type?: string | string[]
  /** Parsed variant, e.g. 'dead', 'dirt_big'. A trailing `*` matches a prefix ('lava*'). One or several. */
  variant?: string | string[]
  /** Inclusive number range. A sid without a number never matches a rule that sets this. */
  num?: { min?: number; max?: number }
  /** The catalog bucket the sid sits in. */
  category?: 'obstacles' | 'clutter' | 'mountains' | 'pools'
}

function listOf(value: string | string[] | undefined): string[] | undefined {
  return value === undefined ? undefined : Array.isArray(value) ? value : [value]
}

function variantMatches(pattern: string, variant: string): boolean {
  return pattern.endsWith('*') ? variant.startsWith(pattern.slice(0, -1)) : variant === pattern
}

export function matchesDecoration(
  matcher: DecorationMatcher, parsed: ParsedDecorationSid, category: NonNullable<DecorationMatcher['category']>,
): boolean {
  if (matcher.category !== undefined && matcher.category !== category) return false
  const types = listOf(matcher.type)
  if (types && !types.includes(parsed.type)) return false
  const variants = listOf(matcher.variant)
  if (variants && !variants.some((pattern) => variantMatches(pattern, parsed.variant))) return false
  if (matcher.num) {
    if (parsed.num === undefined) return false
    if (matcher.num.min !== undefined && parsed.num < matcher.num.min) return false
    if (matcher.num.max !== undefined && parsed.num > matcher.num.max) return false
  }
  return true
}
