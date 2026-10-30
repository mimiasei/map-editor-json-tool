---
title: Déclencheurs et conditions
category: concepts
order: 1
---

## Comment fonctionnent les déclencheurs

Un déclencheur se trouve dans une sous-quête. Chaque déclencheur écoute ses conditions et exécute ses actions quand elles sont remplies. Par défaut, un déclencheur se déclenche **une seule fois**, puis il est désactivé. Réglez `repeat: true` pour les déclencheurs continus (par ex. des gains de ressources hebdomadaires).

> **Note:** Les déclencheurs ne sont pas évalués en continu à chaque tick du jeu. Les conditions sont des **écouteurs à usage unique** : chaque condition se déclenche au moment où son exigence est remplie pour la première fois, puis se désactive définitivement. Une condition ne se réactive pas et ne se redéclenche pas, même si l'exigence cesse d'être remplie par la suite.

## Les conditions sont des écouteurs à usage unique

C'est la règle la plus importante à intégrer : **chaque condition est un écouteur d'événement à usage unique, pas une vérification d'état continue.**

Quand l'exigence d'une condition est remplie pour la première fois, elle se déclenche, puis s'éteint. Elle ne se redéclenchera jamais, sauf si le déclencheur est réévalué depuis le début (par ex. avec `TriggerClear`).

Par exemple : une condition `Counter` réglée sur `quest_stage >= 2` qui s'est déjà déclenchée ne détectera *pas* un retour de `quest_stage` sous 2. Elle s'est déclenchée une fois, c'est terminé.

> **Note:** Cela s'applique à toutes les conditions. Construisez votre logique autour du moment où un état change, pas autour d'un état durable.

## Logique ET et OU

Chaque déclencheur a un réglage `conditionsLogic` : **OR** (une seule condition doit se déclencher) ou **AND** (chaque condition doit s'être déclenchée au moins une fois).

Pour une logique complexe, par exemple « (A et B) ou C », utilisez plusieurs déclencheurs avec des ensembles de conditions distincts.

### La logique ET et le problème de TriggerClear

Comme les conditions sont des écouteurs à usage unique, la logique **AND** se déclenche dès que chaque condition s'est déclenchée une fois, même si elles ne se sont jamais produites en même temps. Par exemple, si votre déclencheur exige « le joueur possède la ville A **ET** la ville B », chaque condition de possession se déclenche indépendamment, la première fois qu'elle est remplie. Tant que les deux finissent par se déclencher (dans n'importe quel ordre), le déclencheur s'exécute.

Cela peut donner des résultats inattendus si une condition se déclenche puis est « invalidée » (par ex. le joueur perd aussitôt la ville). Pour réinitialiser toutes les conditions d'un déclencheur et repartir de zéro, utilisez les actions **`TriggerClear`** ou **`TriggerClearCustom`**, qui effacent l'état « déclenché » des conditions d'un déclencheur donné.

## Les conditions ne sont vérifiées que pour les détenteurs actifs de la quête

Les conditions ne sont évaluées que pour les joueurs dont la quête qui les contient est active. Le champ `sharing` de la quête détermine quels joueurs ont la quête. Une condition *peut* néanmoins référencer des héros ou des objets appartenant à d'autres joueurs, si leurs SID d'entité précis sont utilisés dans les paramètres.

## Conditions fondées sur des événements

Ces conditions se déclenchent quand un événement précis se produit :

- `SquadKill` : un peloton neutre est vaincu
- `HeroKill` : un héros précis est vaincu
- `SquadInteraction` : le joueur s'approche d'un peloton neutre
- `ObjectInteractionBefore` / `ObjectInteractionAfter` : le joueur interagit avec un objet de la carte
- `ObjectLose` : le joueur perd un objet capturable
- `ObjectCaptureEntity` : le joueur capture un objet
- `NodeRevealed` : le brouillard de guerre est levé sur un nœud
- `PlayerDefeated` : un joueur est éliminé

## Conditions fondées sur un état

Ces conditions vérifient l'état actuel du jeu au moment où elles sont évaluées pour la première fois :

- `Counter` : vérifie la valeur d'un compteur : `quest_stage >= 2`
- `UnitOwnSide` / `UnitOwnHero` : vérifie le nombre d'unités dans les armées
- `ResCounter` : vérifie le stock de ressources
- `ItemOwnSide` : vérifie la possession d'un artéfact
- `DifficultyCustomMap` : vérifie le réglage de difficulté de la carte (indice 0 à 4)

## Conditions fondées sur le temps

Ces conditions se déclenchent à des moments précis :

- `StartTurn` : se déclenche au début d'une semaine/d'un jour précis pour un joueur précis. Paramètres : `weekNumber`, `dayNumber`. Utilisez le champ supplémentaire `counter` pour « après X jours au total ».
- `StartWeek` : se déclenche au début de n'importe quelle semaine (tous les 7 tours). Aucun paramètre obligatoire ; accepte le champ supplémentaire facultatif `counter`.
- `AnyStartTurn` : se déclenche au début du tour de n'importe quel joueur. Paramètres : `month`, `week`, `day` (utilisez -1 pour « n'importe lequel »).

## Le champ supplémentaire Compteur

Certaines conditions (`UnitKill`, `UnitLose`, `UnitHire`, `StartTurn`, `StartWeek`) ont un champ supplémentaire **Counter**. Il fixe un seuil : la condition ne se déclenche qu'après avoir été remplie N fois.

Par exemple : `UnitKill` avec `counter: 10` ne se déclenche qu'après la mort de 10 unités de ce type.

> **Note:** Ce champ de compteur est distinct du système de SID de compteurs : c'est un nombre brut, pas une référence à un compteur nommé.

## Aucune condition

Un déclencheur sans condition se déclenche immédiatement quand la sous-quête devient active. Utilisez-le pour des actions « au début de la quête », comme afficher un dialogue d'introduction ou placer des marqueurs de quête.

> **Warning:** Un déclencheur sans condition combiné à `repeat: true` se déclenche à chaque tick. Ce n'est presque jamais ce que vous voulez.
