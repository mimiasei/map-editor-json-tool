Desktop release for macOS (Apple Silicon), Windows, and Linux.

### What's new since 0.9.8-1

- **Map Grid toolbar**: the buttons on the top toolbar are the same size as the paint tools and react the same way. A selected tool or toggle shows its icon enlarged, heavier and white, and an active paint tool (Objects, Spawner, Hero, Landmark, Encounter, Resource, Ramp, River, Obstacles, Trees, Eraser) keeps its icon button instead of turning into a "Drawing..." button. Only one tool can be active at a time, and switching tools no longer lags on large maps. The unselected choice of a Brush / Bucket switch is dimmed, and the terrain biome dropdown closes after you pick a biome.
  - **Player Areas fill** moved from the settings to a toolbar toggle next to the blocked-tile overlay. The unused **Cell border thickness** setting is gone.
  - **Map settings** got a close X, the map icon and room for its switches (no horizontal scrollbar).
  - Fix: **Size** and **Disperse** no longer vanish when another tool's Bucket mode was left on, and painted objects show as blocks while you paint when zoomed out, not only after you release the mouse.
- **Blocked-tile overlay** follows the filter pills: objects hidden by the pills (and "Entity SIDs only") stop blocking in the overlay, and so do their green entrance tiles. Elevation walls and water always count. The button shows an amber dot while the overlay is filtered, so it is not mistaken for the real passability.
- **Quests mode**: the field called "Map name" is now **Project prefix** (publish zip name and sid prefix). It starts as the map title from Map settings, else the saved file name, else `mymap_yyyy_mm_dd`, and follows the map until you type your own.
- **Game skin** (desktop): always dark, so the light/dark switch is hidden while it is on. The five big start-screen buttons get the game's ornamented frame, which fades with the button on hover. The skin has a new sprite, so use **Re-extract** in the Theme editor once.
- **Theme editor** is wider with the colours in two columns when the Game skin is off.

Not checked in the game window itself: the Game skin was only tested in a browser harness. The new texts in fr/de/nb/pl/ru/uk need native review.

See [CHANGELOG](https://github.com/mimiasei/map-editor-json-tool/compare/v0.9.8-1...main) for what changed.
