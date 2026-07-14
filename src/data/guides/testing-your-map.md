---
title: Testing Your Map
category: troubleshooting
order: 1
---

## The map editor does not reflect JSON changes

This is the most important thing to understand: **changes you make in this editor — quest logic, counters, triggers — are invisible in the HoMM:OE map editor.** The map editor only shows the visual layer (terrain, objects, heroes on the map).

Your JSON changes are read by the **game engine at runtime**, not by the map editor.

> **Warning:** Do not open your saved map file in the HoMM:OE map editor and expect to see quest logic. You will only see the visual layer. The game correctly reads the JSON at runtime.

## The test workflow

The correct workflow for testing quest logic:

1. Make your changes in this editor
2. **Save As** (or Export) to get the updated JSON file
3. Replace the scenario JSON in your map file (or place it where the game expects it)
4. Load the map in HoMM:OE
5. Test the relevant scenario in-game
6. Iterate

## Finding the scenario JSON in a map

A `.homm` map file is a ZIP. Extract it and find the `scenario.json` (or similarly named file) in the root or `DB/` folder. Replace it with your updated JSON, then re-ZIP the archive.

> **Note:** Keep a backup of your original map before replacing files.

## Use validation first

Before testing in-game, click **Validate** in the toolbar. The validator catches:

- Missing localization tokens
- Counter references that don't match declared counters
- Quest/subquest SID references that don't exist
- Empty required parameters

Fix all errors before testing. Warnings are informational — the game may still run correctly.

## Quick iteration tips

- Use `CounterSet` to fast-forward quest state in a test trigger (e.g. set `quest_stage` to 5 on Turn 1 to test late-game logic)
- Use `SpawnHero` to place a specific hero for testing conditions that require a hero to exist
- Use `RevealFogOfWar` at map start with a large radius to see everything during testing
