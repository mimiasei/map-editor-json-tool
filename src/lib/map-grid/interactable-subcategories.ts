// ─── Map Grid — Interactables sub-categories (issue #130) ───────────────────
// Core/DB/map/objects/4_interactables.json has no useful categorical field —
// all 315 entries share tag:"Interact" (confirmed during issue #130's
// investigation). The only real structure is the `id` naming convention,
// grouped here in the order they should appear in the sub-category picker.

export type InteractableSubcategory =
  | 'dwellings'
  | 'portals'
  | 'resourceStorage'
  | 'mines'
  | 'altarsOfMagic'
  | 'magicAmplifiers'
  | 'shrines'
  | 'unitTrade'
  | 'campaignOnly'
  | 'other'

export const INTERACTABLE_SUBCATEGORY_ORDER: InteractableSubcategory[] = [
  'dwellings',
  'portals',
  'resourceStorage',
  'mines',
  'altarsOfMagic',
  'magicAmplifiers',
  'shrines',
  'unitTrade',
  'campaignOnly',
  'other',
]

export const INTERACTABLE_SUBCATEGORY_LABELS: Record<InteractableSubcategory, string> = {
  dwellings: 'Dwellings',
  portals: 'Portals',
  resourceStorage: 'Resource Storage',
  mines: 'Mines',
  altarsOfMagic: 'Altars of Magic',
  magicAmplifiers: 'Magic Amplifiers',
  shrines: 'Shrines',
  unitTrade: 'Unit Trade',
  campaignOnly: 'Campaign-only',
  other: 'Other',
}

/** Classifies an interactable's `id` (== PlacedObject.sid) by naming
 *  convention. Order matters — checked top to bottom, first match wins. */
export function resolveInteractableSubcategory(sid: string): InteractableSubcategory {
  if (sid.startsWith('campaign_') || sid.endsWith('_campaign')) return 'campaignOnly'
  if (sid.startsWith('barracks_')) return 'dwellings'
  if (sid.startsWith('portal_')) return 'portals'
  if (sid.startsWith('storage_') || sid.startsWith('custom_storage_')) return 'resourceStorage'
  if (sid.startsWith('mine_')) return 'mines'
  if (sid.startsWith('altar_of_magic_') || sid.startsWith('custom_altar_of_magic_')) return 'altarsOfMagic'
  if (sid.startsWith('magic_amplifier_')) return 'magicAmplifiers'
  if (sid.includes('shrine')) return 'shrines'
  if (sid.startsWith('unit_trade_lab_')) return 'unitTrade'
  return 'other'
}
