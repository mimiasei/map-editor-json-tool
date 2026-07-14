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

A quest is active when the game starts unless you set `activeOnStart: false`.

> **Note:** Quest names and descriptions are displayed to the player. They must be localized — raw text will not appear in the quest log.

## Quest flags: main, hidden, sharing

Three optional flags on a quest change how the game treats it.

**`main: true`** marks a quest as the primary objective of the map. In the in-game quest log this is displayed as the main/primary quest rather than a side objective. Looking at the official scenario files, this is set on quests like `main_quest_line` and `city_attack_quest_line_starter` — the quests the player is expected to focus on. Side quests, AI behavior quests, and background tracking quests leave it unset (defaulting to `false`).

**`hidden: true`** hides the quest from the player's quest log entirely. Use this for quests that exist purely for internal logic — AI movement scripting, background timers, lose conditions — that should never be visible to the player.

**`sharing`** controls how the quest is distributed in multiplayer. Two values are seen in the official scenario files:

- `"Clone"` — each player receives their own independent copy of the quest. Progress is tracked separately per player. This is the default for all normal quests — player vs. side quests, objectives, etc.
- `"Ai"` — the quest is only evaluated for AI-controlled players. Used on hidden quests that script AI hero behavior (e.g. patrol routes, movement patterns). Human players never interact with these quests.

> **Note:** `sharing` is required by the game engine — always set it. The editor defaults new quests to `"Clone"`, which is correct for all player-facing quests.

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

Interruptions are combat lifecycle hooks — they fire when specific hero battle events occur, such as before the player fights an enemy hero or after winning a hero-vs-hero battle. They have no conditions to configure; the event type itself determines when they fire.

Use them for pre-battle dialogs, post-battle rewards, and boss fight sequences. They can be toggled on and off at runtime via `EnableInterruption` and `DisableInterruption` actions.

See [Interruptions](guide:interruptions) for a full breakdown.
