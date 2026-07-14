---
title: How Quests Work
category: getting-started
order: 1
---

## The hierarchy

A scenario file contains three top-level arrays: `counters`, `quests`, and `interruptions`.

Each **quest** has one or more **subquests**. Each subquest has one or more **triggers**. Each trigger has **conditions** and **actions**.

When all conditions in a trigger are met simultaneously, its actions fire.

## Quests

A quest is the top-level container. It appears in the in-game quest log. Its `name` and `description` fields are localization SIDs — they must have matching tokens in your map's `customMaps.json`.

A quest is active when the game starts unless you set `isActive: false`.

> **Note:** Quest names and descriptions are displayed to the player. They must be localized — raw text will not appear in the quest log.

## Subquests

Subquests are the stages within a quest. A simple quest may have only one subquest. A multi-stage quest (e.g. 'find three relics') has multiple subquests that activate in sequence.

Use `CurrentSubQuestDone` or `SubQuestDone` actions to complete a subquest and move to the next.

## Triggers

Triggers are the logic units. Each trigger listens for its conditions and fires its actions when they are all met.

A trigger fires **once** by default. Set `isRepeating: true` to make it fire every time the conditions become true.

> **Warning:** Repeating triggers with no conditions (or always-true conditions) fire every game tick. Always guard repeating triggers with at least one counter or state check.

## Conditions

Conditions are combined with AND or OR logic (set per trigger). If no conditions are present, the trigger fires immediately when the subquest is active.

See [Triggers and Conditions](guide:triggers-and-conditions) for a full breakdown.

## Actions

Actions are executed in order when all conditions are met. Common actions: show a dialog, complete a subquest, advance to the next quest, give resources or items to the player, or trigger victory/defeat.

## Counters

Counters are integer variables that persist for the lifetime of the map. They are declared in the Counters tab and referenced by SID.

Use them to track quest stages, kill counts, resource thresholds, and more. See [Counters and Tracking](guide:counters-and-tracking).

## Interruptions

Interruptions are similar to quests but operate independently of the quest system. They are used for time-sensitive or ambient events — e.g. 'after 10 turns, if the player hasn't visited the shrine, fire a reminder dialog'.

Interruptions are enabled and disabled via `EnableInterruption` and `DisableInterruption` actions.
