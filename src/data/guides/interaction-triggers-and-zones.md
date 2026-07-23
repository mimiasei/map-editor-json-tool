---
title: Interaction Triggers & Trigger Zones
category: concepts
order: 4
---

## What interaction triggers are

Interaction triggers are short, simple action sequences attached directly to a map object in the Unfrozen map editor. They fire when a player's hero interacts with that object — either **before** the object's own effect activates (Actions Before) or **after** it (Actions After).

> **Note:** Interaction triggers are configured in the Unfrozen map editor's object properties panel — not in this tool. This guide explains how they work so you understand the full scripting picture and when to use them vs. quest file triggers.

## How they differ from quest triggers

The critical difference: **interaction triggers completely interrupt standard game logic.** A quest trigger fires its actions but cannot pause or delay what the game would normally do at that moment. An interaction trigger can.

For example:
- A quest trigger that fires when the player interacts with a squad cannot prevent combat from starting — the dialog opens and immediately closes as the battle begins.
- An Actions Before trigger on that same squad *can* show a dialog before the battle screen loads. The death animation after combat also only plays *after* an Actions After dialog has finished.

This makes interaction triggers the right tool for:
- Dialog that must play before a combat or pickup resolves
- Cutscene-style sequences on specific object interactions
- Any moment where you need to pause normal game flow

For dialogs on hero-vs-hero encounters specifically, use [Interruptions](guide:interruptions) instead — interaction triggers cannot be attached to heroes.

## Actions Before vs Actions After

| Property | When it fires |
|---|---|
| Actions Before | Before the object's own effect runs (before combat starts, before resource is collected, etc.) |
| Actions After | After the object's effect resolves (after combat ends, after pickup, etc.) |

Both can be attached to the same object simultaneously. The order in which actions are added within each property determines the order they execute.

> **Warning:** If fewer or more parameters are set for an action than it accepts, the action will not fire. This matches the same rule as quest file actions.

## The Repeat checkbox

Each Actions Before / Actions After property has a **Repeat** checkbox. If enabled, the actions fire every time a hero interacts with the object. If disabled (the default), the actions only fire once — the first time.

## Input sides IDs

The **input sides IDs** field on an interaction trigger limits which players trigger the actions. Enter player indices (0-based) to restrict the trigger. For example, entering `1` means the actions only fire when Player 2's hero interacts with the object.

If the field is left empty, the actions fire for any player.

## Trigger zones

A **trigger zone** is a special type of invisible object placed on the map from the editor's main tools panel. Instead of being attached to a specific object, its actions fire when any hero steps onto one of its cells.

Key behaviors from the official guide:

- **Movement is interrupted** when a hero enters a trigger zone, regardless of what the attached action does or whether it has any visible effect. Even a single `Print` (developer console output) action will stop the hero mid-path.
- **Flying heroes** do not activate a trigger zone's actions if they fly over it and land outside its area. They do activate it if they land inside.
- **The Repeat checkbox** on a trigger zone works the same as on object triggers. Without it, the zone only fires on the first entry. With it, the zone fires every time a hero enters from outside — but not while a hero moves around within the zone.
- **Deactivating a zone** via the `SetActiveMarker` action (or by unchecking "Activate" in the editor) prevents it from interrupting hero movement entirely.

> **Note:** `SetActiveMarker` is available in the action editor in this tool. Use it from a quest trigger to dynamically enable or disable trigger zones at runtime.

## What this editor handles

This editor manages the **quest file** (`map_name.json`) — the `counters`, `interruptions`, and `quests` sections. Interaction triggers and trigger zones are attached to objects in the **Unfrozen map editor** and are not part of the quest file.

However, you can use actions available in this editor to interact with zones at runtime:
- `SetActiveMarker` — enable or disable a trigger zone by its entity SID

See [Interruptions](guide:interruptions) for the quest-file approach to pausing game logic on hero encounters.
