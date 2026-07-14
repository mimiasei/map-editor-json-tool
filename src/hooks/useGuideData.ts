/**
 * Hooks for loading guide system data files.
 * Guide articles are loaded from Markdown files in src/data/guides/ via
 * guideLoader.ts — no manual article registry needed.
 * Tooltips and templates remain statically imported JSON.
 */

import tooltipsData from '@/data/tooltips.json'
import templateIndexData from '@/data/templates/index.json'
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

/** Returns the full tooltip dataset (actions, conditions, fields). */
export function useTooltips(): TooltipData {
  return tooltipsData as TooltipData
}

/** Returns the guide table of contents (categories + article metadata). */
export function useGuideIndex() {
  return buildGuideIndex()
}

/** Returns the template index (categories + template metadata). */
export function useTemplateIndex(): TemplateIndex {
  return templateIndexData as TemplateIndex
}

/** Loads a guide article by ID. Returns a promise (use with React.use or Suspense). */
export async function loadGuideArticle(id: string) {
  return _loadGuideArticle(id)
}

/** Loads a template JSON by ID. Returns the raw parsed JSON object. */
export async function loadTemplate(id: string): Promise<unknown> {
  const importer = templateImporters[id]
  if (!importer) return Promise.reject(new Error(`Unknown template: ${id}`))
  return importer()
}
