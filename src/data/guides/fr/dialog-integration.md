---
title: Intégration des dialogues
category: recipes
order: 1
---

## Vue d'ensemble

Dans HoMM:OE, les dialogues sont définis dans des fichiers JSON distincts, dans `DB/dialogs/dialogs/`. Chaque dialogue a un ID unique et contient une ou plusieurs diapositives (texte + informations sur l'orateur).

L'action `Dialog` joue un dialogue à partir de son ID. L'action `RandomDialog` en joue un au hasard parmi plusieurs.

## Créer un dialogue

Utilisez l'**Éditeur de dialogues** (accessible depuis le panneau Dialogues ou par le raccourci « Modifier le dialogue → » d'une action Dialog). Chaque diapositive a un SID de localisation pour son texte, un orateur facultatif et des informations de portrait facultatives.

Tous les SID de texte des diapositives doivent être ajoutés à la localisation de votre carte via la boîte de dialogue **Localisation**.

## Utiliser l'action Dialog

Ajoutez une action `Dialog` à n'importe quel déclencheur. Réglez le champ **Dialog key** sur le SID exact du dialogue que vous avez créé.

Le dialogue se déclenche quand les conditions du déclencheur sont remplies.

> **Note:** Le dialogue et tous ses jetons de localisation doivent être inclus dans le ZIP de votre carte. Utilisez **Exporter le ZIP** pour tout regrouper.

## Dialogues d'interaction avec un objet

Un schéma courant consiste à afficher un dialogue quand le joueur interagit avec un objet de la carte :

1. Ajoutez un déclencheur dans une sous-quête
2. Ajoutez une condition `ObjectInteractionBefore` et réglez le SID d'entité sur votre objet de carte
3. Ajoutez une action `Dialog`

Le dialogue se déclenche avant l'interaction par défaut avec l'objet (ramassage du trésor, combat, etc.).

## Inclure les dialogues dans le ZIP de la carte

Le jeu lit les dialogues dans le dossier `DB/dialogs/` du ZIP de la carte. L'éditeur s'en charge pour vous : quand vous utilisez **Exporter le ZIP**, tous les dialogues ajoutés avec l'Éditeur de dialogues sont inclus automatiquement.

Ne placez pas les fichiers de dialogue à la main dans le ZIP : l'éditeur gère la structure.

> **Warning:** Si vous référencez un ID de dialogue qui n'existe pas dans le ZIP, le jeu l'ignore silencieusement, sans erreur. Testez toujours les déclencheurs de dialogue dans le jeu.
