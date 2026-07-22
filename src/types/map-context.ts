// ─── Map context types ────────────────────────────────────────────────────────
// Read-only data extracted from a .map binary. Not persisted, not in undo/redo.
// Used for autocomplete, display names, and reference validation.

export interface PlayerSpawn {
  /** Player index (0-based) */
  index: number
  /** Faction SID, e.g. "Haven" */
  factionSid: string
  /** Hero SID assigned to this spawn, if any */
  heroSid: string
  /** Color ID (integer) */
  colorId: number
  /** Whether this player slot is locked */
  isLocked: boolean
  /** Owner string from Block 1 spawns array */
  owner: string
}

export interface MapEntity {
  /** User-defined entity SID (from objectsProperties.propEntities) */
  sid: string
  /** Numeric id used to cross-reference objects[] */
  id: number
  /** Object type string */
  type: string
  /** Map tile X coordinate (column), derived from objects[].nodes */
  x?: number
  /** Map tile Z coordinate (row), derived from objects[].nodes */
  z?: number
}

export interface HeroAssignment {
  /** Hero SID assigned to a spawner */
  heroSid: string
  /** Numeric id of the spawner object */
  id: number
  /** Whether the hero is defined/configured */
  isDefined: boolean
}

export interface BanInfo {
  bannedHeroes: string[]
  bannedUnits: string[]
  bannedMagics: string[]
  bannedItems: string[]
  bannedSkills: string[]
}

/** A placed hero with its map tile coordinates */
export interface HeroPlacement {
  heroSid: string
  x: number
  z: number
}

/** A placed creature squad with its map tile coordinates */
export interface CreaturePlacement {
  unitSid: string
  x: number
  z: number
}

/** A placed artifact with its map tile coordinates */
export interface ArtifactPlacement {
  sid: string
  x: number
  z: number
}

export interface MapContext {
  /** Map name from Block 2 */
  mapName: string
  /** Title from Block 1 */
  title: string
  /** Description from Block 1 */
  desc: string
  /** Map size */
  sizeX: number
  sizeZ: number
  /** Player spawn configurations */
  spawns: PlayerSpawn[]
  /** Named entities available for trigger references */
  entities: MapEntity[]
  /** Hero assignments on spawner objects */
  heroes: HeroAssignment[]
  /** Banned content */
  banInfo: BanInfo
  /** All object SIDs from Block 2 objects[].sid (flat, deduped) */
  objectSids: string[]
  /** Placed heroes with their map tile coordinates */
  heroPlacements: HeroPlacement[]
  /** Placed creature squads with their map tile coordinates (from propSquads) */
  creaturePlacements: CreaturePlacement[]
  /** Placed artifacts with their map tile coordinates (objects with _artifact suffix) */
  artifactPlacements: ArtifactPlacement[]
}
