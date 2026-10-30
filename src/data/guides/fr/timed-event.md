---
title: Événements chronométrés
category: recipes
order: 2
---

## Vue d'ensemble

Les événements chronométrés se déclenchent après un certain nombre de tours. Ils servent par exemple pour :

- Des quêtes à échéance (« vaincre l'ennemi en 20 tours ou perdre »)
- Des renforts périodiques (« chaque semaine, le joueur reçoit 3 archers »)
- Des menaces croissantes (« si la quête n'est pas terminée au tour 15, faire apparaître un ennemi plus fort »)

## Échéance à un tour précis

Pour déclencher quelque chose à un tour précis :

1. Ajoutez un déclencheur avec une condition `StartTurn`
2. Réglez **Turn number** sur le tour voulu (par ex. `15`)
3. Réglez **Player** sur `1` (premier joueur)
4. Ajoutez vos actions (par ex. `Dialog`, `GameLose`, `SpawnHero`)

## Le schéma du compteur de tours

Pour un chronométrage plus souple, par exemple « une fois la quête commencée, attendre 10 tours » :

1. Au début de la quête, utilisez `CounterSet turn_timer 0`
2. Ajoutez un déclencheur répétitif avec `StartTurn` (sans paramètres) et `CounterPlus turn_timer 1`
3. Conditionnez votre déclencheur d'échéance par `Counter: turn_timer >= 10`

Cela mesure les tours écoulés depuis le début de la quête, et non le numéro de tour absolu.

## Événements hebdomadaires répétés

Pour déclencher quelque chose chaque semaine :

1. Ajoutez un déclencheur avec une condition `StartWeek`
2. Réglez `repeat: true`
3. Ajoutez vos actions (par ex. `GiveRes gold 200`)

Cela se déclenche automatiquement tous les 7 tours pendant toute la durée de la carte.

> **Warning:** Les déclencheurs hebdomadaires répétés sans garde de compteur se déclenchent indéfiniment. Si vous voulez qu'ils s'arrêtent après N semaines, ajoutez un compteur, augmentez-le chaque semaine, puis conditionnez avec `Counter: weeks_elapsed < N`.

## Les interruptions et le chronométrage des combats

Les interruptions ne sont pas liées au temps : ce sont des points d'accroche dans le déroulement d'un combat (`BeforeIamVsHero`, `AfterIamWinVsHero`, etc.). Elles servent quand quelque chose doit se produire lors d'un combat précis entre héros plutôt qu'à un tour précis.

Pour des minuteries d'ambiance fondées sur les tours, utilisez des déclencheurs de quête avec les conditions `StartTurn` ou `StartWeek` décrites plus haut. Voir [Interruptions](guide:interruptions) pour ce à quoi servent réellement les interruptions.
