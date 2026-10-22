---
title: Story Builder
category: recipes
order: 3
---

## What it does

The **Story** button in the toolbar adds a complete, connected story to your map: a chain of quests, the dialogs that tell it, and the counters that remember what the player chose. You point at places on your map and pick a tone; the text is written for you. Everything it makes is ordinary quests, counters and dialogs, so you can open and change any of it afterwards like something you wrote yourself.

One undo removes the story's quests and counters. The dialogs and their texts stay in the project, so remove those from the Dialogs list if you do not want them.

> **Note:** Open your `.map` first, so the story can offer the towns, armies and objects that are on your map. Give the map a name in Map Settings, because every id the story creates starts with it.

## Choosing a story

Pick one of the ready-made stories, **Build my own**, or **I have my own idea**.

- **Ready-made stories** each have at least one real choice for the player: *The Cursed Moor* (follow clues, then accuse someone), *The Long Siege* (prepare, then survive a number of days) and *The Border Oath* (take a town, choose how to treat its people, then face a warlord).
- **Build my own** lets you stack steps: an introduction, visiting places, capturing a town, defeating an army, gathering gold, waiting out a number of days, a reward, and player choices. An ending is added for you and reacts to the choices.
- **I have my own idea** turns a few sentences of your own, in any language, into the same kind of story. It needs the text writer (see below).

## Pointing at your map

Each story asks for a few things from your map, such as a town to capture or places to visit. The wizard fills in suggestions so you can just accept them. To change one, search by name or use the pin button to click it on the Map Grid.

> **Note:** Only objects, towns and armies that have a name (an entity id) on the map can be picked. Name them in the game's map editor first.

## Player choices

A choice is a dialog with two to four answers. Each answer can change a counter, give or take gold, and shows its own follow-up text. Some answers are only offered when the player has enough gold.

Later steps read what was chosen. The ending, for example, can differ depending on how many merciful or cruel answers the player gave. This is the "branch, track, pay off" pattern: the choice sets a counter, and something later checks it.

The numbers behind the story are plain counters (see *Counters & Tracking*). The wizard shows them by name, such as "Mercy" or "Clues found", while the counters themselves get ids that start with your map and story name.

## The text

Every line of text can be edited in the preview before anything is added. **Another** gives a different version of one line, and **Rewrite all** redoes the whole story. Edit freely: the text ends up as localization tokens, so you can also change it later in the Localization editor.

Without any setup, the text comes from built-in wording in four tones (heroic, grim, humorous, mysterious). That works well for trying a story out. Answers are generic per kind (bold, cautious, merciful and so on).

## The text writer (optional, desktop app)

With a free key from Google Gemini or Groq, the text is written to fit your story and your map's names, you can write in any of the game's 16 languages, and **I have my own idea** becomes available.

Set it up from the first screen of the Story Builder: choose a service, paste your key and accept the notice. The key is stored in your operating system's credential store, not in the project.

- The text you generate, and any story idea you type, is sent to the service you chose. Free plans may use it to improve their models, so keep anything private out of it.
- If the service cannot be reached, the key is rejected or the free limit is used up, the built-in text is used and the story still works.
- Pick a **Write in** language on the first screen. English is always created too, so the game can fall back to it; the two are shown side by side. Languages you add are translated drafts: read them through before publishing.

> **Warning:** Machine-written and machine-translated text can be wrong or awkward. Always read through the preview, especially in languages you do not speak.

## Before you publish

- Save or Publish embeds the story's quests in the `.map`, like any other quests.
- Dialog ids and texts are shared by every map and zip in the game. The story prefixes everything with your map name; the Problems list warns about dialog ids that do not start with it.
- Test the story in the game. Two details are worth watching: a step can start on the turn after the one before it finished, and the ending uses the closing of the final dialog to give the player the victory.

> **Note:** If a counter is changed but never checked, or checked but never changed, the Problems list says so. After editing a story by hand, look there first.
