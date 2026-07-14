---
title: Creating Your First Quest
category: getting-started
order: 2
---

## What we'll build

A simple quest: the player must defeat a specific neutral squad. When they do, they receive gold and the quest completes.

You can use the **Simple Kill Quest** template (File → New from Template) to load a pre-built version of this pattern.

## Step 1: Add a counter

Open the **Counters** tab and add a new counter. Give it a descriptive SID like `quest_target_killed`. Set its initial value to `0`.

> **Note:** The map editor will not show counters — they exist only in the JSON. The game reads and tracks them correctly at runtime.

## Step 2: Create the quest

In the **Quests** tab, click **Add Quest**. Set:
- `sid` — a unique identifier, e.g. `kill_quest`
- `name` — localization SID for the quest title, e.g. `kill_quest_name`
- `description` — localization SID for the description, e.g. `kill_quest_desc`

Add the localization tokens in the **Localization** dialog (toolbar → Localization button).

## Step 3: Add a subquest

Inside the quest, add a **Subquest**. This represents the 'kill the target' stage. Give it a SID like `kill_quest_1`.

## Step 4: Add a trigger

Inside the subquest, add a **Trigger**. This trigger listens for the kill and fires the completion actions.

## Step 5: Add the SquadKill condition

In the trigger's **Conditions**, add a **Squad Defeated** condition. Set the Squad ID to the entity SID you assigned to the neutral stack in the map editor (e.g. `E_Squad_Dragon`).

> **Note:** The squad entity SID is set in the map editor when you place the neutral stack — it is not the unit type name.

## Step 6: Add completion actions

In the trigger's **Actions**, add:
1. `CounterSet` — set `quest_target_killed` to `1`
2. `GiveRes` — give the player `500` gold as a reward
3. `CurrentSubQuestDone` — complete the current subquest
4. `Dialog` — show a completion dialog (optional but recommended)

## Step 7: Add localization

Open the **Localization** dialog and add tokens:
- `kill_quest_name` → `'Hunt the Dragon'`
- `kill_quest_desc` → `'A dragon has been terrorizing the region. Defeat it.'`

These tokens go into your map's `customMaps.json` when you export the ZIP.

## Step 8: Test

Export the project JSON (Save As), place it in your map, and load the map in-game. See [Testing Your Map](guide:testing-your-map) for the correct workflow.

> **Warning:** The map editor does NOT show quest or counter changes visually. You must load the map in-game to verify your logic works.
