---
title: Créer votre première quête
category: getting-started
order: 2
---

## Ce que nous allons construire

Une quête simple : le joueur doit vaincre un peloton neutre précis. Quand c'est fait, il reçoit de l'or et la quête se termine.

Vous pouvez utiliser le modèle **Quête d'élimination simple** (Fichier → Nouveau à partir d'un modèle) pour charger une version toute faite de ce schéma.

## Étape 1 : ajouter un compteur

Ouvrez l'onglet **Compteurs** et ajoutez un nouveau compteur. Donnez-lui un SID descriptif comme `quest_target_killed` et une valeur initiale de `0`.

> **Note:** L'éditeur de cartes n'affiche pas les compteurs : ils n'existent que dans le JSON. Le jeu les lit et les suit correctement à l'exécution.

## Étape 2 : créer la quête

Dans l'onglet **Quêtes**, cliquez sur **Ajouter une quête**. Renseignez :
- `sid` : un identifiant unique, par ex. `kill_quest`
- `name` : le SID de localisation du titre de la quête, par ex. `kill_quest_name`
- `description` : le SID de localisation de la description, par ex. `kill_quest_desc`

Ajoutez les jetons de localisation dans la boîte de dialogue **Localisation** (barre d'outils → bouton Localisation).

## Étape 3 : ajouter une sous-quête

Dans la quête, ajoutez une **sous-quête**. Elle représente l'étape « tuer la cible ». Donnez-lui un SID comme `kill_quest_1`.

## Étape 4 : ajouter un déclencheur

Dans la sous-quête, ajoutez un **déclencheur**. Il écoute la mort de la cible et exécute les actions de fin de quête.

## Étape 5 : ajouter la condition SquadKill

Dans les **Conditions** du déclencheur, ajoutez la condition **Squad Defeated** (les noms des conditions et des actions restent en anglais dans l'éditeur). Réglez le Squad ID sur le SID d'entité que vous avez attribué au groupe neutre dans l'éditeur de cartes (par ex. `E_Squad_Dragon`).

> **Note:** Le SID d'entité du peloton se définit dans l'éditeur de cartes quand vous placez le groupe neutre : ce n'est pas le nom du type d'unité.

## Étape 6 : ajouter les actions de fin

Dans les **Actions** du déclencheur, ajoutez :
1. `CounterSet` : mettre `quest_target_killed` à `1`
2. `GiveRes` : donner au joueur `500` d'or en récompense
3. `CurrentSubQuestDone` : terminer la sous-quête en cours
4. `Dialog` : afficher un dialogue de fin (facultatif mais recommandé)

## Étape 7 : ajouter la localisation

Ouvrez la boîte de dialogue **Localisation** et ajoutez les jetons :
- `kill_quest_name` → `'Hunt the Dragon'`
- `kill_quest_desc` → `'A dragon has been terrorizing the region. Defeat it.'`

Ces jetons sont écrits dans le `customMaps.json` de votre carte quand vous exportez le ZIP.

## Étape 8 : tester

Exportez le JSON du projet (Sauvegarder sous), placez-le dans votre carte et chargez la carte dans le jeu. Voir [Tester votre carte](guide:testing-your-map) pour la marche à suivre.

> **Warning:** L'éditeur de cartes n'affiche PAS visuellement les changements de quêtes ou de compteurs. Vous devez charger la carte dans le jeu pour vérifier que votre logique fonctionne.
