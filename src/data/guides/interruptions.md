---
title: Interruptions
category: concepts
order: 3
---

## What interruptions are

Interruptions are the third top-level array in a scenario file, alongside `counters` and `quests`. They are **combat lifecycle hooks** — they fire when specific hero battle events occur, not when conditions are met.

An interruption has:
- `sid` — unique identifier used by `EnableInterruption` / `DisableInterruption`
- `interruption` — the event type that triggers it (see below)
- `activeOnStart` — whether it is live when the map loads
- `p` — parameters (typically a hero entity SID to scope the hook)
- `actions` — what runs when the event fires (same action types as quest triggers)

## Interruptions fire unlimited times

Unlike quest triggers (which fire once by default), **an interruption will fire every time its event occurs, without limit, until it is explicitly disabled** via `DisableInterruption`. If you only want it to fire once, disable it from within its own action list.

## Interruption types

| Type | Fires when |
|----------------------|---------------------------------------------------------------|
| `BeforeIamVsHero` | Before battle — player's hero is about to fight an enemy hero |
| `AfterIamWinVsHero` | After the player's hero wins against an enemy hero |
| `BeforeHeroVsHero` | Before any hero-vs-hero battle (regardless of who the player is) |
| `AfterHeroWinVsHero` | After any hero wins a hero-vs-hero battle |

The `p` array scopes the hook to specific heroes. For example, setting `p` to `['E_Hero_Xarfax']` on a `BeforeIamVsHero` interruption makes it fire only when the player's hero is about to fight Xarfax — not every enemy hero.

> **Note:** Unlike quest triggers, interruptions have no conditions to configure. The `interruption` type is the condition. The engine decides when to fire it.

## How interruptions differ from quest triggers

Quest triggers evaluate conditions and fire when those conditions are satisfied. Interruptions are different: the game calls them at specific moments in the battle lifecycle, before or after combat resolution.

Crucially, **interruptions are the only way to pause standard game logic** — such as bypassing automatic combat initiation when a hero walks into an enemy. A quest trigger firing at the same moment cannot do this; its actions run but do not interrupt the combat sequence. An interruption with `BeforeIamVsHero` can show a dialog before the battle screen even loads.

This makes interruptions essential for:
- **Peaceful encounters** — preventing combat from starting and showing a dialog instead
- **Pre-battle flavor** — a villain's taunt before the fight
- **Post-battle rewards** — giving items or advancing quests after a specific fight

## Common use cases

**Pre-battle dialog (villain taunt)**

Show a dialog before the player fights a key enemy hero:

1. Add an interruption with type `BeforeIamVsHero`
2. Set `p` to the enemy hero's entity SID
3. Set `activeOnStart: true`
4. Add a `Dialog` action

The dialog fires the moment the player clicks to attack that hero, before the battle screen loads.

**Post-battle reward and quest progression**

After the player defeats a boss hero, advance the quest and give a reward:

1. Add an interruption with type `AfterIamWinVsHero`
2. Set `p` to the boss hero's entity SID
3. Add actions: `Dialog` (victory speech), `GiveRes` (reward), `CurrentSubQuestDone` or `CounterSet`

> **Warning:** `AfterIamWinVsHero` fires when the player wins. If the player loses the battle, it does not fire. Do not rely on it for 'battle has happened' logic — only for 'player won' logic.

**Boss encounter (combined before + after)**

For a full boss fight experience, pair two interruptions on the same hero SID:

- `BeforeIamVsHero` → taunt dialog
- `AfterIamWinVsHero` → reward + quest advance

**Fire only once**

If you only want the interruption to trigger the first time the player encounters the hero:

1. Set `activeOnStart: true`
2. As the last action in the interruption, add `DisableInterruption` with the interruption's own SID

**Conditional activation**

If the interruption should only be active during a certain quest stage, set `activeOnStart: false` and enable it from a quest trigger:

1. In a quest trigger, add `EnableInterruption` with the interruption's SID
2. After the fight resolves (or from a quest stage change), add `DisableInterruption` to clean up

This prevents the interruption from firing before or after the intended window.

## Parameters (p)

The `p` array's meaning depends on the type. For the four known types, `p[0]` is the **hero entity SID** — the specific hero the interruption is scoped to. If `p` is empty, the interruption fires for any hero matching the type.

> **Note:** Hero entity SIDs are set in the map editor when you place a hero on the map. They look like `E_Hero_Xarfax` or `E_Hero_SomeVillain`. Check the map editor's properties panel for the placed hero object.

## Enabling and disabling at runtime

Use `EnableInterruption` and `DisableInterruption` actions (available in any quest trigger or other interruption's action list) to toggle interruptions on and off:

- `EnableInterruption` — activates the interruption so it will fire on the next matching event
- `DisableInterruption` — deactivates it so it will not fire again until re-enabled

Both actions take the interruption's `sid` as their parameter.
