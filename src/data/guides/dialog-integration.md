---
title: Dialog Integration
category: recipes
order: 1
---

## Overview

Dialogs in HoMM:OE are defined as separate JSON files in `DB/dialogs/dialogs/`. Each dialog has a unique ID and contains one or more slides (text + speaker info).

The `Dialog` action plays a dialog by its ID. The `RandomDialog` action plays one of several dialogs at random.

## Creating a dialog

Use the **Dialog Editor** (accessible from the Dialogs panel or via the 'Edit dialog →' shortcut in a Dialog action). Each dialog slide has a text localization SID, an optional speaker, and optional portrait info.

All slide text SIDs must be added to your map's localization via the **Localization** dialog.

## Using the Dialog action

Add a `Dialog` action to any trigger. Set the **Dialog key** to the exact SID of the dialog you created.

The dialog fires when the trigger's conditions are met.

> **Note:** The dialog and all its localization tokens must be included in your map ZIP. Use **Export ZIP** to bundle everything together.

## Object interaction dialogs

A common pattern is to show a dialog when the player interacts with a map object:

1. Add a trigger in a subquest
2. Add an `ObjectInteractionBefore` condition — set the entity SID to your map object
3. Add a `Dialog` action

The dialog fires before the default object interaction (treasure pickup, battle, etc.).

## Including dialogs in the map ZIP

The game reads dialogs from the map ZIP's `DB/dialogs/` folder. The editor manages these for you: when you use **Export ZIP**, all dialogs added via the Dialog Editor are included automatically.

Do not manually place dialog files in the ZIP — the editor handles the structure.

> **Warning:** If you reference a dialog ID that doesn't exist in the ZIP, the game silently skips it with no error. Always test dialog triggers in-game.
