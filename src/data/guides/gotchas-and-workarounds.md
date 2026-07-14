---
title: Gotchas & Workarounds
category: troubleshooting
order: 2
---

## Triggers fire in declaration order

Within a subquest, triggers are evaluated in the order they are declared. If two triggers could fire on the same tick, the first one fires first. Keep this in mind when one trigger's action enables another trigger's condition.

> **Note:** Actions within a trigger also execute in order. A `CounterSet` in action 1 is visible to the `Counter` condition check in the next trigger on the same tick.

## Repeating triggers and infinite loops

A trigger with `isRepeating: true` and no conditions (or always-true conditions) fires every tick. This is almost certainly a bug.

**Always guard repeating triggers** with at least one condition that becomes false after the desired number of firings — typically a Counter check.

> **Warning:** An infinite-firing trigger can make a map unplayable. Use Counter guards on all repeating triggers.

## SquadKill fires on the squad entity SID, not the unit type

When you place a neutral stack in the map editor, you assign it an entity SID (e.g. `goblin_patrol_1`). The `SquadKill` condition takes **this entity SID**, not the unit type SID (e.g. `goblin`).

If you want to track kills of all goblins, use `UnitKill` with the unit type SID instead.

> **Note:** Entity SIDs are set in the map editor's properties panel for each placed object or squad.

## Dialog actions silently fail if the dialog is missing

If a `Dialog` action references a dialog ID that doesn't exist in the map ZIP, the game skips it silently — no error, no message. The trigger's other actions still fire.

Always verify that every referenced dialog ID exists in your exported ZIP.

> **Warning:** Test all Dialog actions in-game before shipping your map.

## Localization tokens must be in customMaps.json

Quest names, descriptions, dialog text, and any other player-visible strings must have entries in `customMaps.json` inside your map ZIP.

This editor manages localization tokens for you. Use the **Localization** button in the toolbar to add and edit tokens. They are included automatically when you **Export ZIP**.

> **Note:** If a localization SID is missing from customMaps.json, the game shows the raw SID string to the player (e.g. 'kill_quest_name' instead of 'Hunt the Dragon').

## SubQuestActivate vs NextSubQuest

Both actions advance subquests, but they work differently:

- `NextSubQuest` activates the next subquest in sequence (by index or SID) — use for linear progression
- `SubQuestActivate` activates any named subquest on any quest — use for branching or cross-quest interactions

## DeleteHero does not trigger HeroKill

`DeleteHero` removes a hero from the map immediately without triggering the `HeroKill` condition. If you have defeat logic tied to `HeroKill`, do not use `DeleteHero` to simulate the hero dying.

> **Warning:** If your defeat condition depends on HeroKill, ensure the hero can actually die in combat — do not remove them via DeleteHero.

## RemoveRes doesn't check availability

`RemoveRes` removes resources from the player's stockpile. If the player doesn't have enough, the resource is set to 0 — it does not fail or error. Always check resource levels first with a `ResCounter` condition if exact amounts matter.
