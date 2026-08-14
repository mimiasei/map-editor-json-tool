// ─── Script Template registry (issue #149) ─────────────────────────────────────
// Mirrors the CONDITION_REGISTRY/ACTION_REGISTRY convention: a flat lookup by
// id, plus a list for rendering. Each template's real logic lives in its own
// file under src/lib/script-templates/ (unlike conditions/actions, a
// template carries actual code — loops, node resolution — not just metadata).

import type { ScriptTemplateDef } from '@/types/script-template'
import { hutOfTheMagiTemplate } from '@/lib/script-templates/hut-of-the-magi'
import { seersHutTemplate } from '@/lib/script-templates/seers-hut'

export const SCRIPT_TEMPLATE_REGISTRY: Record<string, ScriptTemplateDef> = {
  [hutOfTheMagiTemplate.id]: hutOfTheMagiTemplate,
  [seersHutTemplate.id]: seersHutTemplate,
}

export const SCRIPT_TEMPLATE_LIST: ScriptTemplateDef[] = Object.values(SCRIPT_TEMPLATE_REGISTRY)
