/**
 * Hooks for loading guide system data files.
 * All data is static JSON bundled at build time — no async I/O at runtime.
 */

import tooltipsData from '@/data/tooltips.json'
import guideIndexData from '@/data/guides/index.json'
import templateIndexData from '@/data/templates/index.json'

// ── Types ────────────────────────────────────────────────────────────────────

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

export interface GuideCategory {
  id: string
  label: string
}

export interface GuideArticleMeta {
  id: string
  category: string
  order: number
}

export interface GuideIndex {
  categories: GuideCategory[]
  articles: GuideArticleMeta[]
}

export interface GuideSection {
  heading?: string
  body: string
  note?: string
  warning?: string
}

export interface GuideArticle {
  id: string
  title: string
  category: string
  sections: GuideSection[]
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

export interface TemplateMeta_ {
  id: string
  name: string
  description: string
}

// ── Article cache ─────────────────────────────────────────────────────────────

const articleCache = new Map<string, Promise<GuideArticle>>()

const articleImporters: Record<string, () => Promise<GuideArticle>> = {
  'how-quests-work':         () => import('@/data/guides/how-quests-work.json')         as Promise<GuideArticle>,
  'first-quest':             () => import('@/data/guides/first-quest.json')             as Promise<GuideArticle>,
  'triggers-and-conditions': () => import('@/data/guides/triggers-and-conditions.json') as Promise<GuideArticle>,
  'counters-and-tracking':   () => import('@/data/guides/counters-and-tracking.json')   as Promise<GuideArticle>,
  'dialog-integration':      () => import('@/data/guides/dialog-integration.json')      as Promise<GuideArticle>,
  'timed-event':             () => import('@/data/guides/timed-event.json')             as Promise<GuideArticle>,
  'testing-your-map':        () => import('@/data/guides/testing-your-map.json')        as Promise<GuideArticle>,
  'gotchas-and-workarounds': () => import('@/data/guides/gotchas-and-workarounds.json') as Promise<GuideArticle>,
}

const templateImporters: Record<string, () => Promise<unknown>> = {
  'simple-kill-quest':    () => import('@/data/templates/simple-kill-quest.json'),
  'counter-based-quest':  () => import('@/data/templates/counter-based-quest.json'),
  'timed-event':          () => import('@/data/templates/timed-event.json'),
  'dialog-driven-quest':  () => import('@/data/templates/dialog-driven-quest.json'),
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the full tooltip dataset (actions, conditions, fields). */
export function useTooltips(): TooltipData {
  return tooltipsData as TooltipData
}

/** Returns the guide table of contents (categories + article metadata). */
export function useGuideIndex(): GuideIndex {
  return guideIndexData as GuideIndex
}

/** Returns the template index (categories + template metadata). */
export function useTemplateIndex(): TemplateIndex {
  return templateIndexData as TemplateIndex
}

/** Loads a guide article by ID. Returns a promise (use with React.use or Suspense). */
export async function loadGuideArticle(id: string): Promise<GuideArticle> {
  if (articleCache.has(id)) return articleCache.get(id)!
  const importer = articleImporters[id]
  if (!importer) return Promise.reject(new Error(`Unknown guide article: ${id}`))
  const promise = importer()
  articleCache.set(id, promise)
  return promise
}

/** Loads a template JSON by ID. Returns the raw parsed JSON object. */
export async function loadTemplate(id: string): Promise<unknown> {
  const importer = templateImporters[id]
  if (!importer) return Promise.reject(new Error(`Unknown template: ${id}`))
  return importer()
}
