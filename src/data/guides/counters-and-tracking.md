---
title: Counters and Tracking
category: concepts
order: 2
---

## What counters are

Counters are integer variables attached to the scenario. They are declared in the **Counters** tab with a SID and an initial value, and they persist for the entire lifetime of the map.

They are the primary tool for tracking quest progress, kill counts, resource milestones, and branching logic.

## Declaring a counter

Add a counter in the Counters tab. Set:
- `sid` — a unique string identifier, e.g. `dragons_killed`
- `value` — starting value, almost always `0`

Use descriptive SIDs — you'll reference them by name throughout your trigger logic.

> **Note:** Counters are not shown in the map editor. They exist only in the JSON and are invisible until the map runs in-game.

## Manipulating counters

Three actions change counter values:

- `CounterSet` — sets to a specific value
- `CounterPlus` — increments by amount
- `CounterMinus` — decrements by amount
- `CounterSetRandom` — sets to a random value between min and max

## Checking counters

Use the `Counter` condition to compare a counter's value:

- `quest_stage = 2` — exactly at stage 2
- `dragons_killed >= 5` — at least 5 killed
- `quest_stage != 0` — quest has started

## Quest stage pattern

The most common counter pattern is a **quest stage counter**:

1. Add a counter `quest_main_stage` with initial value `0`
2. On each stage completion, run `CounterSet quest_main_stage → N`
3. Gate the next trigger with `Counter: quest_main_stage = N`

This ensures stages fire in order and only once.

## Kill count pattern

To require killing N of something:

1. Add a counter `kills_count` with initial value `0`
2. Add a `UnitKill` trigger with `CounterPlus kills_count 1` action — set `isRepeating: true`
3. Add a second trigger: when `Counter: kills_count >= N`, fire the completion

Alternatively, use the `UnitKill` condition's built-in Counter extra field to set the threshold directly without a separate counter.

## Random branching

Use `CounterSetRandom` to randomly branch:

1. Set counter `branch` to a random value between 1 and 3
2. Add three separate triggers, each checking `Counter: branch = 1`, `= 2`, `= 3`
3. Each branch fires a different dialog or outcome

Good for ambient flavor events and random encounter variety.
