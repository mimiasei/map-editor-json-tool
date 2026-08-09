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
  /**
   * Where this entity came from. Absent means propEntities — an object the map
   * author explicitly named. 'heroSpawner' means the SID is a hero's own SID,
   * taken from a spawner that has a specific hero assigned (issue #96).
   */
  source?: 'heroSpawner'
  /**
   * Custom display name from objectsProperties.propsName, if the map author
   * set one (issue #120). Shown as-is — a "LOC:<sid>" value means the real
   * text lives in a localization token this tool doesn't resolve, not that
   * the literal string "LOC:..." is what the player sees.
   */
  displayName?: string
  /** True when this entity is a city spawner — its display name is stored in
   *  a different table (objectsProperties.propCities.customCityName), not
   *  propsName.nameTitle like every other object (issue #132). Lets the
   *  "Set display name" flow route the write to the right place. */
  isCitySpawner?: boolean
  /** Custom description from objectsProperties.propsName.description, if set.
   *  Same "literal text or LOC:<sid> reference" convention as displayName. */
  description?: string
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

/**
 * One placed instance of anything on the map — an object, a fixed squad, or
 * a zone marker (issue #122). The single source of truth every other
 * per-category placement list derives from, because `objects[]`/`squads[]`/
 * `markers[]` are three separate id-namespaces that can (and do) collide on
 * the same numeric id — `key` (`${type}:${id}`) is the only safe identity.
 */
export interface PlacedObject {
  /** `${type}:${id}` — stable identity, matches how objectsProperties tables join. */
  key: string
  /** 0 = objects[], 1 = markers[], 2 = squads[]. */
  type: 0 | 1 | 2
  /** Numeric id, unique only within its own `type` namespace. */
  id: number
  /** Object/squad/marker type SID (not a user-authored name). */
  sid: string
  x: number
  z: number
  /** Raw tile index (`z * sizeX + x`) — kept for O(1) tile-index keying. */
  node: number
  rotation?: number
  level?: number
  /** Enrichment: this instance's propEntities SID, if the map author named it. */
  entitySid?: string
  /** Enrichment: this instance's propsName display name, if one is set. */
  displayName?: string
  /** Enrichment: this instance's propsName description, if one is set. Read
   *  directly from propsName, never city-overridden — there's no dedicated
   *  per-city description field the way customCityName exists for names. */
  description?: string
  /** Enrichment: objectsProperties.propNoCombineGeometries — "No Combine Geometry"
   *  in the official editor. Lets an otherwise-non-interactable decoration carry
   *  an entity SID once true (issue #125). */
  noCombineGeometry?: boolean
  /** Enrichment: city/hero spawner info joined from propSpawns + propCities/propHeroes
   *  (issue #125). Present only for objects with a matching propSpawns entry. */
  spawnerInfo?: {
    /** Player slot this spawner is attached to (1..N) — read-only in this editor. */
    owner: number
    /** "Player type": 0=Player (human), 1=Bot (AI), 2=Unknown (open slot). */
    spawnType: 0 | 1 | 2
    /** "Spawner type": 0=City, 1=Hero. */
    spawnPointType: 0 | 1
    /** Set for city spawners with a defined faction; absent/undefined means random or unset. */
    factionSid?: string
    /** Set for hero spawners with a defined hero; absent/undefined means random or unset. */
    heroSid?: string
  }
  /** Enrichment: portal linkage from objectsProperties.propPortals (issue #127).
   *  Present only for objects with a propPortals entry (i.e. actual portal objects). */
  portalInfo?: {
    /** This portal's own instance id (same as PlacedObject.id, kept here for convenience). */
    id: number
    /** Linked portal's instance id, or undefined when unlinked (raw targetIdx was -1). */
    targetIdx?: number
    /** Linked portal's tile coordinates, resolved via targetIdx — undefined when unlinked
     *  or the target instance couldn't be found. */
    targetNode?: number
    /** Whether this endpoint currently works. An inactive portal is receive-only
     *  (the official guide's "exit portal"). */
    isActive: boolean
    /** Derived from both ends' propPortals entries: 'two-way' when the target
     *  portal points back at this one and both ends are active; 'one-way' when
     *  linked but not reciprocal (or this/the target end is inactive);
     *  'unlinked' when targetIdx is absent/-1. */
    linkKind: 'two-way' | 'one-way' | 'unlinked'
  }
  /** Enrichment: the first unit's sid in this squad, from
   *  objectsProperties.propSquads[].unitProps[0].sid (issue #130) — lets the
   *  grid show the unit's real icon instead of the squad's own (non-creature)
   *  sid. Present only for type-2 (squad) placed objects with resolvable unitProps. */
  firstUnitSid?: string
  /** Enrichment: raw objectsProperties.propRewardParams.parameters for this
   *  instance, undecoded — each entry is "-" (unfilled slot),
   *  "resourceSid:amount", or a bare artifact/skill sid. Decoding needs
   *  catalog access this module doesn't have; see
   *  src/lib/map-grid/reward-params.ts. */
  rewardParams?: string[]
  /** Enrichment: objectsProperties.propActivations.isActive — whether this
   *  instance starts active. Absent (not just true) is the common case;
   *  only meaningfully worth surfacing when explicitly false. */
  isActive?: boolean
  /** Enrichment: objectsProperties.propOwners.owner — explicit player-index
   *  ownership override, when set. -1 observed meaning neutral/unowned. */
  owner?: number
  /** Enrichment: objectsProperties.propMarkers, only ever present for
   *  type === 1 (zones) — the official editor's own "Activate" checkbox.
   *  See markerDeleteAfterTrigger's comment for the paired field. */
  markerActive?: boolean
  /** Enrichment: objectsProperties.propMarkers.isDelete — the official
   *  editor's "Delete after trigger" checkbox: whether this zone removes
   *  itself automatically the first time it fires. */
  markerDeleteAfterTrigger?: boolean
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
  /** Every placed object/squad/marker instance on the map (issue #122). */
  placedObjects: PlacedObject[]
  /** Terrain biome ID per tile (DB/map/tiles/tiles.json, 1-7), row-major
   *  by node like everything else. Empty when the map has no known size. */
  tilesMap: number[]
  /** Water material ID per tile (DB/map/waters/waters.json, 1-7), 0 = no water. */
  waterMap: number[]
}
