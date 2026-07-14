---
title: Timed Events
category: recipes
order: 2
---

## Overview

Timed events fire after a certain number of turns have passed. They are useful for:

- Deadline quests ('defeat the enemy within 20 turns or lose')
- Periodic reinforcements ('every week, the player receives 3 archers')
- Escalating threats ('if the quest isn't done by turn 15, spawn a stronger enemy')

## Turn-based deadline

To trigger something at a specific turn:

1. Add a trigger with a `StartTurn` condition
2. Set the **Turn number** to the desired turn (e.g. `15`)
3. Set the **Player** to `1` (first player)
4. Add your actions (e.g. `Dialog`, `GameLose`, `SpawnHero`)

## Turn counter pattern

For more flexible timing — e.g. 'after the quest starts, wait 10 turns':

1. When the quest starts, use `CounterSet turn_timer 0`
2. Add a repeating trigger with `StartTurn` (no params) and `CounterPlus turn_timer 1`
3. Gate your deadline trigger with `Counter: turn_timer >= 10`

This measures turns elapsed since the quest began, not absolute turn number.

## Weekly repeating events

To fire something every week:

1. Add a trigger with a `StartWeek` condition
2. Set `isRepeating: true`
3. Add your actions (e.g. `GiveRes gold 200`)

This fires automatically every 7 turns for the duration of the map.

> **Warning:** Weekly repeating triggers with no counter guard fire indefinitely. If you want them to stop after N weeks, add a Counter and increment it each week, then guard with `Counter: weeks_elapsed < N`.

## Interruptions for ambient timers

Interruptions are well-suited for background timed events that don't belong to a specific quest:

1. Create an interruption with a `StartTurn` trigger
2. Enable it via `EnableInterruption` from a quest trigger when the timer should start
3. The interruption fires independently of quest state
4. Disable it with `DisableInterruption` when done
