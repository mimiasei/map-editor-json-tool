import { z } from 'zod'

// ─── Permissive schemas — validate structure, not content ───────────────────────
// sid and param values are strings; we don't restrict to known values at Zod level.

export const CounterSchema = z.object({
  sid: z.string(),
  value: z.number(),
  comment: z.string().optional(),
  sharing: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
})

export const ActionSchema = z.object({
  a: z.string(),
  p: z.array(z.string()).optional(),
  break: z.boolean().optional(),
})

export const ConditionSchema = z.object({
  c: z.string(),
  p: z.array(z.string()).optional(),
  counter: z.number().optional(),
})

export const TriggerSchema = z.object({
  conditionsLogic: z.enum(['And', 'Or']).optional(),
  repeat: z.boolean().optional(),
  conditions: z.array(ConditionSchema),
  actions: z.array(ActionSchema),
})

export const SubQuestSchema = z.object({
  sid: z.string(),
  activeOnStart: z.boolean(),
  name: z.string().optional(),
  comment: z.string().optional(),
  triggers: z.array(TriggerSchema),
})

export const SubQuestGroupSchema = z.object({
  sid: z.string(),
  subQuests: z.array(z.string()),
})

export const QuestSchema = z.object({
  sid: z.string(),
  main: z.boolean().optional(),
  hidden: z.boolean().optional(),
  comment: z.string().optional(),
  activeOnStart: z.boolean(),
  name: z.string().optional(),
  desc: z.string().optional(),
  sharing: z.string().optional(),
  subQuests: z.array(SubQuestSchema),
  subQuestGroups: z.array(SubQuestGroupSchema).optional(),
})

export const InterruptionSchema = z.object({
  sid: z.string(),
  interruption: z.string(),
  activeOnStart: z.boolean(),
  p: z.array(z.string()),
  actions: z.array(ActionSchema),
})

export const ScenarioFileSchema = z.object({
  counters: z.array(CounterSchema),
  interruptions: z.array(InterruptionSchema),
  quests: z.array(QuestSchema),
})

// ─── Inferred types (match src/types/scenario.ts) ──────────────────────────────
export type ScenarioFileZ = z.infer<typeof ScenarioFileSchema>
