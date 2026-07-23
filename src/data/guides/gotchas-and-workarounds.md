---
title: Gotchas & Workarounds
category: troubleshooting
order: 2
---

## The quest file is mandatory — even for interaction triggers

For **any** scripting logic to work on a map, a quest file `map_name.json` must exist in the same folder as `map_name.map`, and it must contain at least an empty `"quests"` block. Without it, even the simplest interaction triggers attached to objects via the map editor's "Actions Before/After" will break map loading entirely.

> **Warning:** Always create and export your quest file before testing scripting in-game, even if it only contains an empty quests array.

## One bad action breaks the entire trigger

If any action in a trigger is written incorrectly — wrong type name, wrong number of parameters, invalid SID — that action will not fire. **Neither will any other action in the same trigger.** The whole action list silently fails.

> **Warning:** If a trigger seems to do nothing at all, check every action for typos in the type name and mismatched parameter counts. Test with a simple `Print` action first to confirm the trigger fires.

## Actions execute instantaneously — not sequentially in real time

All actions fire one after another without waiting for the previous one to complete (except dialogs, which do pause execution). This means chaining two actions that both produce visible movement or animation may produce unexpected results — only the last one's outcome will be visible.

For example, two `MoveCamera` actions in a row will cause the camera to immediately skip toward the second destination, as the first movement is instantly superseded.

> **Note:** If you need sequential timed actions (animate, pause, then animate again), use dialog actions as breaks between them, or redesign the trigger as multiple subquest steps.

## The break parameter

Any action can have the optional `break: true` field set. When a `break` action executes, all remaining actions in the trigger are skipped. Use this for conditional branching — pair it with dialog actions (`DialogIfHero`, `DialogIfRes`, `DialogIfCounter`) that only run for certain players or states.

Example: show a special dialog for Hero A, break, then continue with actions for everyone else.

## AND logic fires on "both have fired once" — not "both true at the same time"

Because conditions are one-time listeners, `conditionsLogic: "And"` fires as soon as each individual condition has triggered once — even if they never occurred simultaneously. If a condition fires and is then "undone" (e.g. the player captures a building and then loses it), the trigger still fires when the second condition later triggers, because the first condition already fired.

To reset the conditions and start fresh, use `TriggerClear` (resets the current trigger) or `TriggerClearCustom` (resets a specific trigger by index in another subquest).

## Triggers fire in declaration order

Within a subquest, triggers are evaluated in the order they are declared. If two triggers fire on the same tick, the first one fires first. Keep this in mind when one trigger's action enables another trigger's condition.

> **Note:** Actions within a trigger also execute in order. A `CounterSet` in action 1 is visible to a `Counter` condition check in the next trigger on the same tick.

## Repeating triggers and infinite loops

A trigger with `repeat: true` and no conditions (or always-true conditions) fires every tick. This is almost certainly a bug.

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
