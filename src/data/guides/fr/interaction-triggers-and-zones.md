---
title: Déclencheurs d'interaction et zones de déclenchement
category: concepts
order: 4
---

## Ce que sont les déclencheurs d'interaction

Les déclencheurs d'interaction sont de courtes séquences d'actions simples, rattachées directement à un objet de la carte dans l'éditeur de cartes d'Unfrozen. Ils se déclenchent quand le héros d'un joueur interagit avec cet objet, soit **avant** que l'effet propre de l'objet ne s'active (Actions Before), soit **après** (Actions After).

> **Note:** Les déclencheurs d'interaction se configurent dans le panneau de propriétés des objets de l'éditeur de cartes d'Unfrozen, pas dans cet outil. Ce guide explique leur fonctionnement pour que vous compreniez l'ensemble du scripting et sachiez quand les préférer aux déclencheurs du fichier de quêtes.

## En quoi ils diffèrent des déclencheurs de quête

La différence essentielle : **les déclencheurs d'interaction interrompent complètement la logique normale du jeu.** Un déclencheur de quête exécute ses actions mais ne peut pas suspendre ou retarder ce que le jeu ferait normalement à ce moment-là. Un déclencheur d'interaction le peut.

Par exemple :
- Un déclencheur de quête qui se déclenche quand le joueur interagit avec un peloton ne peut pas empêcher le combat de commencer : le dialogue s'ouvre et se referme aussitôt que la bataille démarre.
- Un déclencheur Actions Before sur ce même peloton *peut* afficher un dialogue avant le chargement de l'écran de combat. L'animation de mort après le combat ne se joue aussi qu'*après* la fin d'un dialogue Actions After.

Les déclencheurs d'interaction sont donc l'outil adapté pour :
- Un dialogue qui doit se jouer avant la résolution d'un combat ou d'un ramassage
- Des séquences façon cinématique sur des interactions précises avec des objets
- Tout moment où il faut suspendre le déroulement normal du jeu

Pour les dialogues lors de rencontres héros contre héros, utilisez plutôt les [Interruptions](guide:interruptions) : les déclencheurs d'interaction ne peuvent pas être rattachés à des héros.

## Actions Before et Actions After

| Propriété | Quand elle se déclenche |
|---|---|
| Actions Before | Avant l'effet propre de l'objet (avant le début du combat, avant la collecte de la ressource, etc.) |
| Actions After | Après la résolution de l'effet de l'objet (après la fin du combat, après le ramassage, etc.) |

Les deux peuvent être rattachées en même temps au même objet. L'ordre dans lequel les actions sont ajoutées à chaque propriété détermine l'ordre d'exécution.

> **Warning:** Si une action a plus ou moins de paramètres que ce qu'elle accepte, elle ne s'exécute pas. C'est la même règle que pour les actions du fichier de quêtes.

## La case Repeat

Chaque propriété Actions Before / Actions After a une case à cocher **Repeat**. Si elle est cochée, les actions se déclenchent chaque fois qu'un héros interagit avec l'objet. Sinon (par défaut), elles ne se déclenchent qu'une fois : la première fois.

## Input sides IDs

Le champ **input sides IDs** d'un déclencheur d'interaction limite les joueurs qui déclenchent les actions. Saisissez des indices de joueurs (à partir de 0) pour restreindre le déclencheur. Par exemple, saisir `1` signifie que les actions ne se déclenchent que lorsque le héros du joueur 2 interagit avec l'objet.

Si le champ est vide, les actions se déclenchent pour n'importe quel joueur.

## Les zones de déclenchement

Une **zone de déclenchement** est un type spécial d'objet invisible, placé sur la carte depuis le panneau d'outils principal de l'éditeur. Au lieu d'être rattachées à un objet précis, ses actions se déclenchent quand n'importe quel héros pose le pied sur l'une de ses cases.

Comportements clés d'après le guide officiel :

- **Le déplacement est interrompu** quand un héros entre dans une zone de déclenchement, quoi que fasse l'action rattachée et même si elle n'a aucun effet visible. Une seule action `Print` (sortie console de développement) suffit à arrêter le héros en plein trajet.
- **Les héros volants** n'activent pas les actions d'une zone s'ils la survolent et atterrissent en dehors. Ils les activent s'ils atterrissent à l'intérieur.
- **La case Repeat** d'une zone de déclenchement fonctionne comme celle des déclencheurs d'objets. Sans elle, la zone ne se déclenche qu'à la première entrée. Avec elle, la zone se déclenche chaque fois qu'un héros y entre depuis l'extérieur, mais pas quand il se déplace à l'intérieur de la zone.
- **Désactiver une zone** avec l'action `SetActiveMarker` (ou en décochant « Activate » dans l'éditeur) l'empêche complètement d'interrompre le déplacement des héros.

> **Note:** `SetActiveMarker` est disponible dans l'éditeur d'actions de cet outil. Utilisez-la depuis un déclencheur de quête pour activer ou désactiver dynamiquement des zones de déclenchement à l'exécution.

## Ce que gère cet éditeur

Cet éditeur gère le **fichier de quêtes** (`map_name.json`) : les sections `counters`, `interruptions` et `quests`. Les déclencheurs d'interaction et les zones de déclenchement sont rattachés à des objets dans l'**éditeur de cartes d'Unfrozen** et ne font pas partie du fichier de quêtes.

Vous pouvez toutefois utiliser les actions disponibles dans cet éditeur pour interagir avec les zones à l'exécution :
- `SetActiveMarker` : active ou désactive une zone de déclenchement à partir de son SID d'entité

Voir [Interruptions](guide:interruptions) pour l'approche par fichier de quêtes qui suspend la logique du jeu lors des rencontres entre héros.
