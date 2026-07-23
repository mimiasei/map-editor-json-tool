---
title: Triggers and Conditions
category: concepts
order: 1
---

## How triggers work

A trigger sits inside a subquest. Each trigger listens for its conditions and fires its actions when they are satisfied. A trigger fires **once** by default and is then disabled. Set `repeat: true` for continuous triggers (e.g. weekly resource grants).

> **Note:** Triggers do not evaluate continuously on every game tick. Conditions are **one-time listeners** — each condition fires the moment its requirement is first met, then deactivates permanently. A condition will not re-enable itself or fire again, even if the requirement ceases to be met later.

## Conditions are one-time listeners

This is the most important rule to internalize: **every condition is a one-time event listener, not a continuous state check.**

When a condition's requirement is met for the first time, it fires — and then turns itself off. It will never fire again unless the trigger is re-evaluated from scratch (e.g. via `TriggerClear`).

For example: a `Counter` condition set to `quest_stage >= 2` that has already fired will *not* detect if `quest_stage` later drops back below 2. It fired once; it is done.

> **Note:** This applies to all conditions. Plan your logic around the moment a state changes, not around an ongoing state.

## AND vs OR logic

Each trigger has a `conditionsLogic` setting: **OR** (any one condition must fire) or **AND** (all conditions must each fire at least once).

For complex logic — e.g. '(A and B) or C' — use multiple triggers with separate condition sets.

### AND logic and the TriggerClear problem

Because conditions are one-time listeners, **AND** logic fires as soon as each condition has fired once — even if they never occurred simultaneously. For example, if your trigger requires "player owns Town A **AND** player owns Town B", each ownership condition fires independently when first met. As long as both eventually fire (in any order), the trigger will execute.

This can cause unexpected results if a condition fires and is then "invalidated" (e.g. the player immediately loses the town). To reset all conditions on a trigger and start fresh, use the **`TriggerClear`** or **`TriggerClearCustom`** actions, which clear the fired state of conditions in a specified trigger.

## Conditions are only checked for active quest owners

Conditions are only evaluated for players who have the quest containing them active. Which players have a quest is determined by the quest's `sharing` field. However, a condition *can* still reference heroes or objects belonging to other players — if their specific entity SIDs are used in the parameters.

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

These conditions check the current game state at the moment they are first evaluated:

- `Counter` — checks a counter's value: `quest_stage >= 2`
- `UnitOwnSide` / `UnitOwnHero` — checks unit counts in armies
- `ResCounter` — checks resource stockpile
- `ItemOwnSide` — checks artifact ownership
- `DifficultyCustomMap` — checks map difficulty setting (index 0–4)

## Time-based conditions

These conditions fire at specific points in time:

- `StartTurn` — fires at the start of a specific week/day for a specific player. Params: `weekNumber`, `dayNumber`. Use the `counter` extra field for "after X days total" instead.
- `StartWeek` — fires at the start of any week (every 7 turns). No required params; supports the optional `counter` extra field.
- `AnyStartTurn` — fires at the start of any player's turn. Params: `month`, `week`, `day` (use -1 for any).

## The counter extra field

Some conditions (`UnitKill`, `UnitLose`, `UnitHire`, `StartTurn`, `StartWeek`) have an extra **Counter** field. This sets a threshold: the condition only fires after it has been met N times.

For example: `UnitKill` with `counter: 10` fires only after 10 of that unit type have been killed.

> **Note:** This counter field is separate from the counter SID system — it is a raw number, not a reference to a named counter.

## No conditions

A trigger with no conditions fires immediately when the subquest becomes active. Use this for "on quest start" actions like showing an introduction dialog or placing quest markers.

> **Warning:** A no-condition trigger combined with `repeat: true` fires every tick. This is almost never what you want.
