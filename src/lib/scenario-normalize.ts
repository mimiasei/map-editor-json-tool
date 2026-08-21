import type { Quest, SubQuest } from '@/types/scenario'

/**
 * Real-world sidecar/Block-4 quest data has been observed omitting a
 * subquest's `triggers` array entirely (a subquest that only gates on
 * activeOnStart + external conditions, never firing its own trigger) —
 * legal authoring, but not what the schema or downstream consumers
 * (entity-usage.ts, validate.ts) expect. Repairing it here, once, at the
 * untrusted-JSON boundary keeps every internal consumer's "these are always
 * arrays" assumption actually true.
 */
export function normalizeQuests(raw: unknown): Quest[] {
  if (!Array.isArray(raw)) return []
  return raw.map((q) => normalizeQuest(q as Record<string, unknown>))
}

function normalizeQuest(q: Record<string, unknown>): Quest {
  return {
    ...(q as unknown as Quest),
    subQuests: Array.isArray(q.subQuests)
      ? (q.subQuests as unknown[]).map((sq) => normalizeSubQuest(sq as Record<string, unknown>))
      : [],
  }
}

function normalizeSubQuest(sq: Record<string, unknown>): SubQuest {
  return {
    ...(sq as unknown as SubQuest),
    triggers: Array.isArray(sq.triggers) ? (sq.triggers as SubQuest['triggers']) : [],
  }
}
