Desktop release for macOS (Apple Silicon), Windows, and Linux.

### What's new since 0.9.4

- **Generate on this map** (Map Grid) runs the random map generator on top of the map you have open: pick layers one by one (terrain, decorations, interactables, treasures, encounters, water, elevation, roads, rivers, zone borders) or press **Finish the map**. Nothing you placed is moved or deleted, and the whole run is one undo step.
- **Random maps got a lot closer to the game's own**: zone count follows the map size (new Chain layout), hires, artifacts, chests, resource piles, guards and neutral cities are filled at the game templates' density, borders have sturdier walls and gates, and a map below the minimum fairness is re-rolled. With a game template picked, its mandatory objects (mines, mana wells, markets and so on) and treasure budgets are placed too.
- **Random map Quality setting** (Fast / Normal / Thorough): how many fairness re-rolls and sense-check passes run. The pass keeps powerful objects away from the start cities, puts village-type objects (windmill, stables, tavern, market...) near them, caps strong objects by map size, and repairs by deleting the less important of two clashing objects.
- **Map Grid looks much closer to the game**: the game's own ground textures, cliffs, ramps, roads, rivers, water and 3D object models, with a Walkables brush, stacked objects and right-mouse panning as in GME.
- **Fairness check** button: scores the map with the generator's own algorithm and gives recommendations.
- **Validate dialog** can delete the object or what blocks it, one by one or all at once.
- **Quests are now saved inside the .map**, so published maps actually run their quests in the game.
- **Story Builder**: builds a whole story (quests, dialogs, counters, texts) from premade stories or your own idea, with an optional AI text writer and offline phrase banks.
- **Game skin** (desktop build): Theme editor > Game skin dresses dialogs, buttons, text fields, dropdowns, menus and tooltips in the game's own interface graphics. The graphics are extracted from your game folder with one click and are not part of the app. The text uses a similar font, as the game's own was not found in its files.
- **Game Database**: object and artifact descriptions now show their real numbers (e.g. "Gives the first visiting hero 6000-10000 XP"), objects and artifacts show the game's value, and creatures, artifacts and objects can be sorted by name or value.
- **New interface languages**: French, German, Ukrainian, Russian, Norwegian and Polish (first drafts, not reviewed by native speakers), a new toolbar with a Map | Quests switch, and a new start screen.
- Map Stats shows Random resources, Artifacts, Road Tiles and Neutral Zones; File > Open Recent; random cities can have an owner and faction; the eraser removes objects while you drag.

Not played in the game yet: Generate on this map, the Chain layout, the quality pass and the template-based placement. The new texts in fr/de/nb/pl/ru/uk need native review.

See [CHANGELOG](https://github.com/mimiasei/map-editor-json-tool/compare/v0.9.4...main) for what changed.
