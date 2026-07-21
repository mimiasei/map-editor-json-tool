// ─── Debug flags ──────────────────────────────────────────────────────────────
// Set any flag to true to enable console logging for that subsystem.
// All flags should be false before committing to main.

export const DEBUG = {
  mapLoading:   true,   // map-file.ts — parsing, block 4, scenario extraction
  entitySids:   true,   // ScenarioTree — map context entities
  gameDatabase: true,   // GameDatabaseDialog — catalog/tab switching
} as const
