---
title: Pièges et contournements
category: troubleshooting
order: 2
---

## Le fichier de quêtes est obligatoire, même pour les déclencheurs d'interaction

Pour que **n'importe quelle** logique de script fonctionne sur une carte, un fichier de quêtes `map_name.json` doit exister dans le même dossier que `map_name.map`, et il doit contenir au moins un bloc `"quests"` vide. Sans lui, même les déclencheurs d'interaction les plus simples, rattachés aux objets via « Actions Before/After » dans l'éditeur de cartes, empêchent complètement le chargement de la carte.

**Les quêtes s'exécutent depuis le `.map`, pas depuis le `.json`.** Le jeu lit les quêtes dans le bloc 4 à l'intérieur du `.map` (signalé par l'octet d'en-tête qui suit la chaîne de version, `0d 00` au lieu de `05 00`) et ignore le `.json` voisin pendant la partie. Cet outil intègre les quêtes au `.map` à la sauvegarde et à la publication ; un `.json` modifié à la main ne fait rien tant que la carte n'est pas sauvegardée à nouveau. Deux autres choses font qu'une carte ignore silencieusement ses quêtes ou disparaît de la liste : deux fichiers `.map` ayant le même hash d'en-tête (une carte copiée a besoin d'un nouveau hash), et des fichiers `.zip` dans StreamingAssets dont les ID de dialogue ou les jetons de texte répètent ceux de Core.zip ou d'un autre zip (ils s'écrasent mutuellement : gardez-les uniques par carte).

> **Warning:** Créez et exportez toujours votre fichier de quêtes avant de tester les scripts dans le jeu, même s'il ne contient qu'un tableau de quêtes vide.

## Une seule mauvaise action fait échouer tout le déclencheur

Si une action d'un déclencheur est mal écrite (mauvais nom de type, mauvais nombre de paramètres, SID invalide), cette action ne s'exécute pas. **Aucune autre action du même déclencheur non plus.** Toute la liste d'actions échoue silencieusement.

> **Warning:** Si un déclencheur semble ne rien faire du tout, vérifiez chaque action : fautes de frappe dans le nom du type et nombre de paramètres incorrect. Testez d'abord avec une simple action `Print` pour confirmer que le déclencheur se déclenche.

## Les actions s'exécutent instantanément, pas à la suite en temps réel

Toutes les actions s'enchaînent sans attendre la fin de la précédente (sauf les dialogues, qui suspendent l'exécution). Enchaîner deux actions qui produisent chacune un mouvement ou une animation visible peut donc donner des résultats inattendus : seul le résultat de la dernière sera visible.

Par exemple, deux actions `MoveCamera` à la suite font sauter immédiatement la caméra vers la seconde destination, car le premier mouvement est aussitôt remplacé.

> **Note:** Si vous avez besoin d'actions chronométrées successives (animer, attendre, puis animer à nouveau), utilisez des actions de dialogue comme pauses, ou refaites le déclencheur en plusieurs étapes de sous-quête.

## L'indicateur break sur les actions

N'importe quelle action peut avoir le champ facultatif `"break": true`. Quand une action avec `break: true` s'exécute, toutes les actions restantes du déclencheur sont ignorées. Utilisez-le pour des embranchements conditionnels : associez-le à des actions de dialogue (`DialogIfHero`, `DialogIfRes`, `DialogIfCounter`) qui ne s'exécutent que pour certains joueurs ou états, puis réglez `break: true` sur ces actions pour arrêter l'exécution pour ce joueur avant les actions communes.

Exemple : afficher un dialogue spécial pour le héros A (avec `break: true`), puis les actions qui suivent ne s'exécutent que pour les autres héros.

## La logique AND se déclenche sur « les deux se sont déclenchées une fois », pas sur « les deux sont vraies en même temps »

Comme les conditions sont des écouteurs à usage unique, `conditionsLogic: "And"` se déclenche dès que chaque condition s'est déclenchée une fois, même si elles ne se sont jamais produites en même temps. Si une condition se déclenche puis est « annulée » (par ex. le joueur capture un bâtiment puis le perd), le déclencheur se déclenche tout de même quand la seconde condition se déclenche plus tard, car la première s'est déjà déclenchée.

Pour réinitialiser les conditions et repartir de zéro, utilisez `TriggerClear` (réinitialise le déclencheur courant) ou `TriggerClearCustom` (réinitialise un déclencheur précis, par indice, dans une autre sous-quête).

## Les déclencheurs se déclenchent dans l'ordre de déclaration

Dans une sous-quête, les déclencheurs sont évalués dans l'ordre où ils sont déclarés. Si deux déclencheurs se déclenchent au même tick, le premier passe en premier. Gardez-le en tête quand l'action d'un déclencheur active la condition d'un autre.

> **Note:** Les actions d'un déclencheur s'exécutent aussi dans l'ordre. Un `CounterSet` dans l'action 1 est visible par une vérification de condition `Counter` dans le déclencheur suivant, au même tick.

## Déclencheurs répétitifs et boucles infinies

Un déclencheur avec `repeat: true` et sans condition (ou avec des conditions toujours vraies) se déclenche à chaque tick. C'est presque certainement un bug.

**Conditionnez toujours les déclencheurs répétitifs** avec au moins une condition qui devient fausse après le nombre voulu de déclenchements, en général une vérification de compteur.

> **Warning:** Un déclencheur qui se déclenche indéfiniment peut rendre une carte injouable. Utilisez des gardes de compteur sur tous les déclencheurs répétitifs.

## SquadKill se déclenche sur le SID d'entité du peloton, pas sur le type d'unité

Quand vous placez un groupe neutre dans l'éditeur de cartes, vous lui attribuez un SID d'entité (par ex. `goblin_patrol_1`). La condition `SquadKill` prend **ce SID d'entité**, et non le SID du type d'unité (par ex. `goblin`).

Si vous voulez suivre les morts de tous les gobelins, utilisez plutôt `UnitKill` avec le SID du type d'unité.

> **Note:** Les SID d'entité se définissent dans le panneau de propriétés de l'éditeur de cartes pour chaque objet ou peloton placé.

## Les actions Dialog échouent silencieusement si le dialogue est introuvable

Si une action `Dialog` référence un ID de dialogue qui n'existe pas dans le ZIP de la carte, le jeu l'ignore silencieusement : aucune erreur, aucun message. Les autres actions du déclencheur s'exécutent quand même.

Vérifiez toujours que chaque ID de dialogue référencé existe dans votre ZIP exporté.

> **Warning:** Testez toutes les actions Dialog dans le jeu avant de publier votre carte.

## Les jetons de localisation doivent être dans customMaps.json

Les noms et descriptions de quêtes, les textes de dialogue et toute autre chaîne visible par le joueur doivent avoir des entrées dans `customMaps.json`, à l'intérieur du ZIP de votre carte.

Cet éditeur gère les jetons de localisation pour vous. Utilisez le bouton **Localisation** de la barre d'outils pour ajouter et modifier des jetons. Ils sont inclus automatiquement quand vous **exportez le ZIP**.

> **Note:** Si un SID de localisation manque dans customMaps.json, le jeu affiche au joueur la chaîne SID brute (par ex. « kill_quest_name » au lieu de « Hunt the Dragon »).

## SubQuestActivate ou NextSubQuest

Les deux actions font avancer les sous-quêtes, mais elles fonctionnent différemment :

- `NextSubQuest` active la sous-quête suivante dans la séquence (par indice ou SID) : pour une progression linéaire
- `SubQuestActivate` active n'importe quelle sous-quête nommée de n'importe quelle quête : pour les embranchements ou les interactions entre quêtes

## DeleteHero déclenche bien HeroKill

`DeleteHero` retire un héros de la carte et, comme une défaite, une retraite ou une reddition en combat, cela déclenche la condition `HeroKill`. `DeleteHero` est donc un moyen valable de simuler la mort d'un héros pour une logique de quête qui dépend de `HeroKill`.

## RemoveRes ne vérifie pas la disponibilité

`RemoveRes` retire des ressources du stock du joueur. Si le joueur n'en a pas assez, la ressource est mise à 0 : l'action n'échoue pas et ne produit pas d'erreur. Vérifiez toujours d'abord les niveaux de ressources avec une condition `ResCounter` si les quantités exactes comptent.
