/**
 * Hooks for loading guide system data files.
 * Guide articles are loaded from Markdown files in src/data/guides/ via
 * guideLoader.ts — no manual article registry needed.
 * Tooltips and templates remain statically imported JSON.
 */

import { useTranslation } from 'react-i18next'
import tooltipsData from '@/data/tooltips.json'
import tooltipsFr from '@/data/tooltips.fr.json'
import tooltipsDe from '@/data/tooltips.de.json'
import tooltipsUk from '@/data/tooltips.uk.json'
import tooltipsNb from '@/data/tooltips.nb.json'
import tooltipsRu from '@/data/tooltips.ru.json'
import tooltipsPl from '@/data/tooltips.pl.json'
import templateIndexData from '@/data/templates/index.json'
import templateIndexFr from '@/data/templates/index.fr.json'
import templateIndexDe from '@/data/templates/index.de.json'
import templateIndexUk from '@/data/templates/index.uk.json'
import templateIndexNb from '@/data/templates/index.nb.json'
import templateIndexRu from '@/data/templates/index.ru.json'
import templateIndexPl from '@/data/templates/index.pl.json'
import i18n from '@/lib/i18n'
import {
  buildGuideIndex,
  loadGuideArticle as _loadGuideArticle,
} from '@/lib/guideLoader'

// ── Re-export guide types from the loader ─────────────────────────────────────

export type { GuideSection, GuideArticle, GuideArticleMeta, GuideCategory, GuideIndex } from '@/lib/guideLoader'

// ── Types (non-guide) ─────────────────────────────────────────────────────────

export interface TooltipEntry {
  summary: string
  params?: Record<string, string>
  tip?: string
}

export interface TooltipData {
  actions: Record<string, TooltipEntry>
  conditions: Record<string, TooltipEntry>
  fields: Record<string, string>
}

export interface TemplateCategory {
  id: string
  label: string
}

export interface TemplateMeta {
  id: string
  name: string
  description: string
  category: string
}

export interface TemplateIndex {
  categories: TemplateCategory[]
  templates: TemplateMeta[]
}

// ── Template importers ────────────────────────────────────────────────────────

const templateImporters: Record<string, () => Promise<unknown>> = {
  'simple-kill-quest':   () => import('@/data/templates/simple-kill-quest.json'),
  'counter-based-quest': () => import('@/data/templates/counter-based-quest.json'),
  'timed-event':         () => import('@/data/templates/timed-event.json'),
  'dialog-driven-quest': () => import('@/data/templates/dialog-driven-quest.json'),
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** The tooltip text per UI language code; the ids (action/condition types, field keys) are the same in every file. English is the fallback. */
const TOOLTIPS_BY_LANGUAGE: Record<string, TooltipData> = { en: tooltipsData as TooltipData, fr: tooltipsFr as TooltipData, de: tooltipsDe as TooltipData, uk: tooltipsUk as TooltipData, nb: tooltipsNb as TooltipData, ru: tooltipsRu as TooltipData, pl: tooltipsPl as TooltipData }

/** Returns the full tooltip dataset (actions, conditions, fields) in the UI language. */
export function useTooltips(): TooltipData {
  const { i18n } = useTranslation()
  return TOOLTIPS_BY_LANGUAGE[i18n.language] ?? TOOLTIPS_BY_LANGUAGE.en
}

/** Returns the guide table of contents (categories + article metadata). */
export function useGuideIndex() {
  return buildGuideIndex()
}

/**
 * The translated text of the templates per UI language code: category labels, template names and descriptions, and the annotation banners.
 * Only the display text is translated; the template's quests, counters and sids are written into the user's map and stay as they are.
 */
const TEMPLATE_TEXT_BY_LANGUAGE: Record<string, typeof templateIndexFr> = { fr: templateIndexFr, de: templateIndexDe, uk: templateIndexUk, nb: templateIndexNb, ru: templateIndexRu, pl: templateIndexPl }

/** Returns the template index (categories + template metadata) in the UI language. */
export function useTemplateIndex(): TemplateIndex {
  const { i18n: lang } = useTranslation()
  const base = templateIndexData as TemplateIndex
  const text = TEMPLATE_TEXT_BY_LANGUAGE[lang.language]
  if (!text) return base
  return {
    categories: base.categories.map((c) => ({ ...c, label: text.categories.find((x) => x.id === c.id)?.label ?? c.label })),
    templates: base.templates.map((t) => {
      const tr = text.templates.find((x) => x.id === t.id)
      return tr ? { ...t, name: tr.name, description: tr.description } : t
    }),
  }
}

/** Loads a guide article by ID. Returns a promise (use with React.use or Suspense). */
export async function loadGuideArticle(id: string) {
  return _loadGuideArticle(id)
}

/** Loads a template JSON by ID. Returns the raw parsed JSON object. */
export async function loadTemplate(id: string): Promise<unknown> {
  const importer = templateImporters[id]
  if (!importer) return Promise.reject(new Error(`Unknown template: ${id}`))
  const raw = await importer()
  const annotations = (TEMPLATE_TEXT_BY_LANGUAGE[i18n.language]?.annotations as Record<string, Record<string, string>> | undefined)?.[id]
  if (!annotations) return raw
  // Same paths as the English annotations; the banners show the translated text.
  return { ...(raw as Record<string, unknown>), _annotations: annotations }
}
