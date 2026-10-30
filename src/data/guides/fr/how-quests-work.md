---
title: Comment fonctionnent les quêtes
category: getting-started
order: 1
---

## La hiérarchie

Un fichier de scénario contient trois tableaux de premier niveau : `counters`, `quests` et `interruptions`.

Chaque **quête** a une ou plusieurs **sous-quêtes**. Chaque sous-quête a un ou plusieurs **déclencheurs**. Chaque déclencheur a des **conditions** et des **actions**.

Quand les conditions d'un déclencheur sont remplies, ses actions s'exécutent.

## Les quêtes

Une quête est le conteneur de premier niveau. Elle apparaît dans le journal de quêtes du jeu. Ses champs `name` et `description` sont des SID de localisation : ils doivent avoir des jetons correspondants dans le `customMaps.json` de votre carte.

Une quête est active au lancement de la partie, sauf si vous réglez `activeOnStart: false`.

> **Note:** Les noms et descriptions des quêtes sont affichés au joueur. Ils doivent être localisés : du texte brut n'apparaîtra pas dans le journal de quêtes.

## Les indicateurs de quête : main, hidden, sharing

Trois indicateurs facultatifs d'une quête changent la façon dont le jeu la traite.

**`main: true`** marque une quête comme l'objectif principal de la carte. Dans le journal de quêtes du jeu, elle est affichée comme la quête principale plutôt que comme un objectif secondaire. D'après les fichiers de scénario officiels, il est réglé sur des quêtes comme `main_quest_line` et `city_attack_quest_line_starter`, celles sur lesquelles le joueur est censé se concentrer. Les quêtes secondaires, les quêtes de comportement de l'IA et les quêtes de suivi en arrière-plan ne le définissent pas (valeur par défaut : `false`).

**`hidden: true`** cache entièrement la quête du journal de quêtes du joueur. Utilisez-le pour les quêtes qui n'existent que pour la logique interne (scripts de déplacement de l'IA, minuteries en arrière-plan, conditions de défaite) et qui ne doivent jamais être visibles du joueur.

**`sharing`** détermine comment la quête est distribuée en multijoueur. Deux valeurs apparaissent dans les fichiers de scénario officiels :

- `"Clone"` : chaque joueur reçoit sa propre copie indépendante de la quête. La progression est suivie séparément pour chaque joueur. C'est la valeur par défaut de toutes les quêtes normales (joueur contre environnement, objectifs, etc.).
- `"Ai"` : la quête n'est évaluée que pour les joueurs contrôlés par l'IA. Utilisée sur des quêtes cachées qui scriptent le comportement des héros de l'IA (par ex. itinéraires de patrouille, schémas de déplacement). Les joueurs humains n'interagissent jamais avec ces quêtes.

> **Note:** `sharing` est exigé par le moteur du jeu : réglez-le toujours. L'éditeur met `"Clone"` par défaut sur les nouvelles quêtes, ce qui convient à toutes les quêtes destinées aux joueurs.

## Isolation des quêtes

Le contenu de chaque quête est complètement isolé de celui de toutes les autres. Cela signifie que les SID d'entité, les références de compteurs et d'autres identifiants peuvent se répéter d'une quête à l'autre sans conflit.

## Les sous-quêtes

Les sous-quêtes sont les étapes d'une quête. Une quête simple peut n'avoir qu'une sous-quête. Une quête en plusieurs étapes (par ex. « trouver trois reliques ») a plusieurs sous-quêtes qui s'activent à la suite.

Utilisez les actions `CurrentSubQuestDone` ou `SubQuestDone` pour terminer une sous-quête et passer à la suivante.

## Groupes de sous-quêtes : étapes parallèles

Les sous-quêtes peuvent être réunies en **groupes de sous-quêtes**. Le jeu traite alors plusieurs étapes parallèles comme un seul bloc : l'étape suivante ne se débloque que lorsqu'elles sont toutes terminées.

**Exemple :** la sous-quête 3 « Vaincre le boss final » ne doit s'activer que lorsque le joueur a terminé la sous-quête 1 « Trouver l'épée légendaire » ET la sous-quête 2 « Trouver le bouclier légendaire ».

Au lieu de créer des quêtes cachées auxiliaires pour suivre cela, vous pouvez :

1. Définir un groupe de sous-quêtes (par ex. `subquest_group_relics`)
2. Y affecter la sous-quête 1 et la sous-quête 2
3. Terminer les deux sous-quêtes par `NextAfterGroup` au lieu de `NextSubQuest`, en passant en paramètres le SID du groupe et le SID de la sous-quête cible

La sous-quête 3 ne deviendra active qu'après que les deux sous-quêtes du groupe auront appelé `NextAfterGroup`.

> **Note:** Cela se configure avec les actions `NextAfterGroup` ou `NextQuestAfterGroup`. Le SID du groupe est défini dans la section `subQuestGroups` de la quête.

## Les déclencheurs

Les déclencheurs sont les unités de logique. Chaque déclencheur écoute ses conditions et exécute ses actions quand elles sont remplies.

Par défaut, un déclencheur se déclenche **une seule fois**. Réglez `repeat: true` pour qu'il se déclenche chaque fois que les conditions deviennent remplies.

> **Warning:** Les déclencheurs répétitifs sans conditions (ou avec des conditions toujours vraies) se déclenchent à chaque tick du jeu. Conditionnez toujours un déclencheur répétitif avec au moins un compteur ou une vérification d'état.

## Ordre d'exécution des déclencheurs

Si plusieurs déclencheurs d'une même sous-quête se déclenchent en même temps, leurs actions s'exécutent dans l'ordre de déclaration : toutes les actions du premier déclencheur, puis toutes celles du deuxième, et ainsi de suite. Gardez-le en tête quand les actions d'un déclencheur influencent les conditions d'un autre déclencheur de la même sous-quête.

## SID d'entité : relier les déclencheurs aux objets de la carte

De nombreuses conditions et actions doivent référencer un **objet précis placé sur la carte** : un groupe neutre, une ville, un héros, un tas de ressources, un portail, etc. Cela se fait avec un **SID d'entité**.

Dans l'éditeur de cartes, chaque objet interactif a un champ **Entity** dans son panneau de propriétés. Le renseigner donne à cette instance placée un identifiant unique, distinct de son type. Par exemple, un groupe de dragons placé près de la ville de départ peut recevoir le SID d'entité `E_Squad_Dragon`. Un portail peut s'appeler `portal_south`.

Ce SID d'entité est ce que vous saisissez dans le paramètre concerné de cet éditeur. Par exemple :

- condition `SquadKill` : saisissez le SID d'entité du groupe neutre placé
- `ObjectInteractionBefore` / `ObjectInteractionAfter` : saisissez le SID d'entité de l'objet de la carte sur lequel le joueur marche
- action `DeleteEntity` : saisissez le SID d'entité de l'objet à supprimer
- action `SetQuestMarker` : saisissez le SID d'entité de l'objet à marquer

> **Note:** Les SID d'entité ne sont pas les SID de type. `E_Squad_Dragon` est l'*instance placée* d'un groupe ; `Dragon` est le type d'unité. Utilisez toujours le SID d'entité (celui du champ Entity de l'éditeur de cartes) quand une condition ou une action demande une référence d'objet.

## Les conditions

Les conditions se combinent avec une logique ET ou OU (réglée par déclencheur). S'il n'y a aucune condition, le déclencheur se déclenche immédiatement quand la sous-quête est active.

Voir [Déclencheurs et conditions](guide:triggers-and-conditions) pour le détail complet.

## Les actions

Les actions s'exécutent dans l'ordre quand toutes les conditions sont remplies. Actions courantes : afficher un dialogue, terminer une sous-quête, passer à la quête suivante, donner des ressources ou des objets au joueur, ou déclencher la victoire ou la défaite.

## Les compteurs

Les compteurs sont des variables entières qui persistent pendant toute la durée de vie de la carte. Ils se déclarent dans l'onglet Compteurs et se référencent par leur SID.

Utilisez-les pour suivre les étapes de quête, les nombres de victimes, les seuils de ressources, etc. Voir [Compteurs et suivi](guide:counters-and-tracking).

## Les interruptions

Les interruptions sont des points d'accroche dans le déroulement des combats : elles se déclenchent lors d'événements précis d'un combat entre héros, par exemple avant que le joueur n'affronte un héros ennemi ou après une victoire lors d'un combat héros contre héros. Elles n'ont aucune condition à configurer : c'est le type d'événement lui-même qui détermine quand elles se déclenchent.

Utilisez-les pour des dialogues d'avant-combat, des récompenses d'après-combat et des séquences de combat contre un boss. On peut les activer et les désactiver à l'exécution avec les actions `EnableInterruption` et `DisableInterruption`.

Voir [Interruptions](guide:interruptions) pour le détail complet.
