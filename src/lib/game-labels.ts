// Display names of fixed game vocabulary (artifact slots, rarities, spell schools, ...) in the UI language. The English ids/values
// stay what is stored and compared; unknown values are shown as they are.
import i18n from '@/lib/i18n'
import { BASIC_RESOURCE_IDS } from '@/lib/resources'

function look(prefix: string, id: string, fallback: string): string {
  const key = `${prefix}.${id}`
  return i18n.exists(key) ? i18n.t(key as 'shared.rarities.Common') : fallback
}

export const artifactSlotName = (slot: string): string => look('shared.artifactSlots', slot.replace(/[^A-Za-z]+/g, ''), slot)
/** Resource ids are the game's (`gold`, `gemstones`, ...); the French names are the game's own (Lang/french ui.json `*_name`). */
export const resourceName = (id: string): string => look('shared.resources', id, id)

/** An enum param option as shown: resource ids are translated, everything else stays as the schema spells it. */
export const enumOptionLabel = (option: string): string => (BASIC_RESOURCE_IDS.includes(option) ? resourceName(option) : option)
export const rarityName = (rarity: string): string => look('shared.rarities', rarity, rarity)
export const spellSchoolName = (school: string): string => look('shared.spellSchools', school, school)
export const artifactKindName = (kind: string): string => look('common.artifactBanDialog.kinds', kind, kind)
export const avatarPositionName = (position: number): string => look('dialogs.avatarStrip.positions', String(position), String(position))
