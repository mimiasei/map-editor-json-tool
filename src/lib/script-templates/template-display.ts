// What the Script Templates dialog shows for a template, in the UI language. The English definitions in the template files stay as
// they are (they are what the generator and the project data know); only the picker text is translated, with the English as fallback.
import i18n from '@/lib/i18n'

const camel = (id: string): string => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

function lookup(templateId: string, path: string, english: string): string {
  const key = `tree.scriptTemplateForms.defs.${camel(templateId)}.${path}`
  return i18n.exists(key) ? i18n.t(key as 'tree.scriptTemplateForms.defs.sphinx.name') : english
}

export const templateName = (t: { id: string; name: string }): string => lookup(t.id, 'name', t.name)
export const templateDescription = (t: { id: string; description: string }): string => lookup(t.id, 'description', t.description)
export const templateSlotLabel = (t: { id: string }, slot: { id: string; label: string }): string => lookup(t.id, `slots.${slot.id}.label`, slot.label)
export const templateSlotDescription = (t: { id: string }, slot: { id: string; description?: string }): string | undefined =>
  slot.description === undefined ? undefined : lookup(t.id, `slots.${slot.id}.description`, slot.description)
export const templateParamLabel = (t: { id: string }, param: { id: string; label: string }): string => lookup(t.id, `params.${param.id}.label`, param.label)
export const templateParamPlaceholder = (t: { id: string }, param: { id: string; placeholder?: string }): string | undefined =>
  param.placeholder === undefined ? undefined : lookup(t.id, `params.${param.id}.placeholder`, param.placeholder)
