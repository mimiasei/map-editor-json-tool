---
title: Compteurs et suivi
category: concepts
order: 2
---

## Ce que sont les compteurs

Les compteurs sont des variables entières rattachées au scénario. Ils se déclarent dans l'onglet **Compteurs** avec un SID et une valeur initiale, et persistent pendant toute la durée de vie de la carte.

Ils servent surtout à suivre l'avancement des quêtes, les nombres de victimes, les seuils de ressources et les embranchements de la logique.

## Déclarer un compteur

Ajoutez un compteur dans l'onglet Compteurs. Renseignez :
- `sid` : un identifiant textuel unique, par ex. `dragons_killed`
- `value` : la valeur de départ, presque toujours `0`

Utilisez des SID descriptifs : vous les référencerez par leur nom dans toute la logique de vos déclencheurs.

> **Note:** Les compteurs ne sont pas affichés dans l'éditeur de cartes. Ils n'existent que dans le JSON et restent invisibles tant que la carte n'est pas lancée dans le jeu.

## Modifier les compteurs

Quatre actions changent la valeur d'un compteur :

- `CounterSet` : fixe une valeur précise
- `CounterPlus` : augmente d'une quantité
- `CounterMinus` : diminue d'une quantité
- `CounterSetRandom` : fixe une valeur aléatoire entre un minimum et un maximum

## Vérifier les compteurs

Utilisez la condition `Counter` pour comparer la valeur d'un compteur :

- `quest_stage = 2` : exactement à l'étape 2
- `dragons_killed >= 5` : au moins 5 tués
- `quest_stage != 0` : la quête a commencé

## Le schéma de l'étape de quête

Le schéma de compteur le plus courant est le **compteur d'étape de quête** :

1. Ajoutez un compteur `quest_main_stage` avec la valeur initiale `0`
2. À la fin de chaque étape, exécutez `CounterSet quest_main_stage → N`
3. Conditionnez le déclencheur suivant par `Counter: quest_main_stage = N`

Ainsi, les étapes se déclenchent dans l'ordre et une seule fois.

## Le schéma du nombre de victimes

Pour exiger de tuer N éléments d'un type :

1. Ajoutez un compteur `kills_count` avec la valeur initiale `0`
2. Ajoutez un déclencheur `UnitKill` avec l'action `CounterPlus kills_count 1`, et réglez `repeat: true`
3. Ajoutez un second déclencheur : quand `Counter: kills_count >= N`, déclenchez la fin

Vous pouvez aussi utiliser le champ supplémentaire Compteur intégré à la condition `UnitKill` pour fixer le seuil directement, sans compteur séparé.

## Embranchement aléatoire

Utilisez `CounterSetRandom` pour créer un embranchement aléatoire :

1. Fixez le compteur `branch` à une valeur aléatoire entre 1 et 3
2. Ajoutez trois déclencheurs distincts, qui vérifient chacun `Counter: branch = 1`, `= 2`, `= 3`
3. Chaque branche déclenche un dialogue ou un résultat différent

Idéal pour des événements d'ambiance et pour varier les rencontres aléatoires.
