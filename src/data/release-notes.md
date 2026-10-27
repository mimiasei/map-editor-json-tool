Desktop release for macOS (Apple Silicon), Windows, and Linux.

### What's new since 0.9.4

- **Map Grid looks much closer to the game.** Terrain uses the game's own biome ground textures (blended per biome, with a fade between neighbouring biomes), cliffs use the game's cliff pieces, ramps show as shaded slopes, and roads and rivers are drawn with the game's own pieces. Objects are rendered from the game's 3D models, and city spawners show the chosen faction's city.
- **Water**: shore fade, a translucent teal surface with ripples and glints (switch in the Map Grid settings), and water spreads over a newly lowered area connected to existing water when you release the stroke.
- **Fairness check**: a new button next to Validate scores the map with the same algorithm the random map generator uses, with recommendations, a "not compared" list and a per-player decorations section.
- **Link portals** in the Map Grid by clicking the partner portal (two-way, with unlink). Not yet verified in the game.
- **Story Builder**: wizard that builds a whole story (quests, dialogs, counters, texts) from premade stories or your own idea, with an optional AI text writer (Gemini / Groq key) and offline phrase banks.
- **Quests are now saved inside the .map** (Block 4), so published maps actually run their quests in the game.
- **File > Open Recent** lists your recent maps and projects, newest first.
- **Objects can be stacked** on top of each other with a rearrangeable order; mirrored objects and objects rotated 180/270 degrees are drawn flipped.
- **Bucket-filling a Player Area** now also paints the blocked tiles of objects inside it (e.g. a city's footprint).
- Starting artifacts for custom heroes, a Hero tool for placing random heroes, Actions Before/After editing for zones and objects, map pickers inside the Map Grid, and a Duplicate button on actions.
- Random map generator: max heroes per player setting, and it remembers your last settings.
- Map Grid: drawing quality setting, object browser Size filter and Reset all, a banner when painting Player Areas while they are hidden in settings, a styled paint toolbar with new icons, and faster edits.
- **New Walkables brush** (flower icon, right of Trees): scatters grass, flowers and mushrooms with the same biome-mix settings as Trees.
- **Trees and Obstacles brushes mix more biomes on Snow and Lava** when high-contrast biomes are off: Snow also takes Grass pine trees, Deathland and Dirt; Lava also takes Deathland and Grass. The Mountains share in Obstacles now starts at 50%.
- **The eraser removes objects while you drag**, instead of only when you release the mouse button (rivers, roads and ramps still go on release).
- **Random cities can be given an owner and a faction** in the info column. A new random city now starts with no owner ("None", as in GME) instead of becoming Player 1's when GME opens the map. "Neutral" owners are now called "None".
- **The Map Grid pans with the right mouse button**, as in GME (it was the middle button), and a banner with a progress bar shows while the terrain textures load.
- **Saving no longer pops up a list of map issues**; the Validate button still lists them on demand.
- **Help > What's new** shows these notes.
- Elevation now blocks the lower ring around a raised area, as verified in the game.

See [CHANGELOG](https://github.com/mimiasei/map-editor-json-tool/compare/v0.9.4...v0.9.5-4) for what changed.
