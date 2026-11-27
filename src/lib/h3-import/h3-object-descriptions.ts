// English descriptions of the H3 objects, crawled from the Heroes Wiki (homm.fandom.com) API, keyed by H3 object id. Shown in the H3 Object Mapping
// tool so the user can see what an object does before choosing its OE counterpart. Not localised. `generic` entries describe a whole group of
// objects behind one id; `titleMismatch` entries were found under a page whose title differs from the H3 name and are only a best guess.

import data from './h3-object-descriptions.json'

export interface H3ObjectDescription {
  name: string
  wikiTitle: string
  description: string
  generic?: boolean
  titleMismatch?: boolean
}

const DESCRIPTIONS = data as Record<string, H3ObjectDescription>

export function getH3ObjectDescription(h3Id: number): H3ObjectDescription | undefined {
  return DESCRIPTIONS[String(h3Id)]
}
