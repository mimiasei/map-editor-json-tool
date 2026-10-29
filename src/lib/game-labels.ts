// Display names of fixed game vocabulary (artifact slots, rarities, spell schools, ...) in the UI language. The English ids/values
// stay what is stored and compared; unknown values are shown as they are.
import i18n from '@/lib/i18n'

function look(prefix: string, id: string, fallback: string): string {
  const key = `${prefix}.${id}`
  return i18n.exists(key) ? i18n.t(key as 'shared.rarities.Common') : fallback
}

export const artifactSlotName = (slot: string): string => look('shared.artifactSlots', slot.replace(/[^A-Za-z]+/g, ''), slot)
export const rarityName = (rarity: string): string => look('shared.rarities', rarity, rarity)
export const spellSchoolName = (school: string): string => look('shared.spellSchools', school, school)
export const artifactKindName = (kind: string): string => look('common.artifactBanDialog.kinds', kind, kind)
export const avatarPositionName = (position: number): string => look('dialogs.avatarStrip.positions', String(position), String(position))
