---
title: Triggers and Conditions
category: concepts
order: 1
---

## How triggers work

A trigger sits inside a subquest. When the game evaluates the scenario (every tick), it checks each active trigger. If all of the trigger's conditions are satisfied, its actions fire.

By default, a trigger fires **once** and is then disabled. Set `isRepeating: true` for continuous triggers (e.g. weekly resource grants).

## AND vs OR logic

Each trigger has a `conditionsLogic` setting: **AND** (all conditions must be true) or **OR** (any one condition must be true).

For complex logic — e.g. '(A and B) or C' — use multiple triggers with separate condition sets.

## Event-based conditions

These conditions fire when a specific event occurs:

- `SquadKill` — a neutral squad is defeated
- `HeroKill` — a specific hero is defeated
- `SquadInteraction` — player approaches a neutral squad
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — player interacts with a map object
- `ObjectLose` — player loses a capturable object
- `ObjectCaptureEntity` — player captures an object
- `NodeRevealed` — fog of war is lifted at a node
- `PlayerDefeated` — a player is eliminated

## State-based conditions

These conditions check the current game state:

- `Counter` — checks a counter's value: `quest_stage >= 2`
- `UnitOwnSide` / `UnitOwnHero` — checks unit counts in armies
- `ResCounter` — checks resource stockpile
- `ItemOwnSide` — checks artifact ownership
- `DifficultyCustomMap` — checks map difficulty setting

## Time-based conditions

These conditions fire at specific points in time:

- `StartTurn` — fires at the start of a specific turn for a specific player (or any turn if omitted)
- `StartWeek` — fires at the start of any week (every 7 turns)
- `AnyStartTurn` — fires at the start of any player's turn

## The counter extra field

Some conditions (`UnitKill`, `UnitLose`, `UnitHire`, `StartTurn`) have an extra **Counter** field. This sets a threshold: the condition only fires after it has been met N times.

For example: `UnitKill` with `counter: 10` fires only after 10 of that unit type have been killed.

> **Note:** This counter field is separate from the counter SID system — it's a raw number, not a reference to a named counter.

## No conditions

A trigger with no conditions fires immediately when the subquest becomes active. Use this for 'on quest start' actions like showing an introduction dialog or placing quest markers.

> **Warning:** A no-condition trigger combined with `isRepeating: true` fires every tick. This is almost never what you want.
