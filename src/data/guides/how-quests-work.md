---
title: How Quests Work
category: getting-started
order: 1
---

## The hierarchy

A scenario file contains three top-level arrays: `counters`, `quests`, and `interruptions`.

Each **quest** has one or more **subquests**. Each subquest has one or more **triggers**. Each trigger has **conditions** and **actions**.

When a trigger's conditions are satisfied, its actions fire.

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

## Quest isolation

The contents of each quest are completely isolated from all other quests. This means that entity SIDs, counter references, and other identifiers can repeat across different quests without conflict.

## Subquests

Subquests are the stages within a quest. A simple quest may have only one subquest. A multi-stage quest (e.g. 'find three relics') has multiple subquests that activate in sequence.

Use `CurrentSubQuestDone` or `SubQuestDone` actions to complete a subquest and move to the next.

## Subquest-groups — parallel steps

Subquests can be combined into **subquest groups**. This allows the game to treat several parallel steps as a single unit — the next step only unlocks when all of them are done.

**Example:** Subquest-3 "Defeat the final boss" should only enable after the player completes both Subquest-1 "Find the legendary sword" AND Subquest-2 "Find the legendary shield."

Instead of creating auxiliary hidden quests to track this, you can:

1. Define a subquest group (e.g. `subquest_group_relics`)
2. Assign Subquest-1 and Subquest-2 to it
3. End both subquests with `NextAfterGroup` instead of `NextSubQuest`, passing the group SID and the target subquest SID as parameters

Subquest-3 will only become active after both subquests in the group have called `NextAfterGroup`.

> **Note:** This is configured via the `NextAfterGroup` or `NextQuestAfterGroup` actions. The group SID is defined in the `subQuestGroups` section of the quest.

## Triggers

Triggers are the logic units. Each trigger listens for its conditions and fires its actions when they are satisfied.

A trigger fires **once** by default. Set `repeat: true` to make it fire every time the conditions become satisfied.

> **Warning:** Repeating triggers with no conditions (or always-true conditions) fire every game tick. Always guard repeating triggers with at least one counter or state check.

## Trigger execution order

If multiple triggers in the same subquest fire simultaneously, their actions are executed in declaration order: all actions of the first trigger run first, then all actions of the second, and so on. Keep this in mind when one trigger's actions affect the conditions of another trigger in the same subquest.

## Entity SIDs — linking triggers to map objects

Many conditions and actions need to reference a **specific object placed on the map** — a neutral stack, a town, a hero, a resource pickup, a portal, etc. This is done via an **entity SID**.

In the Map Editor, every interactive object has an **Entity** field in its properties panel. Setting this field gives that specific placed instance a unique identifier, separate from its type. For example, a Dragon stack placed near the starting town might be given the entity SID `E_Squad_Dragon`. A portal might be `portal_south`.

That entity SID is what you enter into the relevant parameter in this editor. For example:

- `SquadKill` condition — enter the entity SID of the placed neutral stack
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — enter the entity SID of the map object the player walks onto
- `DeleteEntity` action — enter the entity SID of the object to remove
- `SetQuestMarker` action — enter the entity SID of the object to mark

> **Note:** Entity SIDs are not the same as type SIDs. `E_Squad_Dragon` is the *placed instance* of a stack; `Dragon` is the unit type. Always use the entity SID (from the Map Editor's Entity field) when a condition or action asks for an object reference.

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
