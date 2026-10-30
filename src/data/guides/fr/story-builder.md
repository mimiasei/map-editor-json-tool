---
title: Créateur d'histoires
category: recipes
order: 3
---

## Ce qu'il fait

Le bouton **Histoire** de la barre d'outils ajoute à votre carte une histoire complète et cohérente : une chaîne de quêtes, les dialogues qui la racontent et les compteurs qui retiennent les choix du joueur. Vous désignez des lieux de votre carte et choisissez un ton ; le texte est écrit pour vous. Tout ce qu'il crée, ce sont des quêtes, des compteurs et des dialogues ordinaires : vous pouvez ensuite les ouvrir et les modifier comme si vous les aviez écrits vous-même.

Une seule annulation retire les quêtes et les compteurs de l'histoire. Les dialogues et leurs textes restent dans le projet : supprimez-les de la liste des dialogues si vous n'en voulez pas.

> **Note:** Ouvrez d'abord votre `.map`, pour que l'histoire puisse proposer les villes, les armées et les objets présents sur votre carte. Donnez un nom à la carte dans les paramètres de la carte, car chaque identifiant créé par l'histoire commence par ce nom.

## Choisir une histoire

Choisissez l'une des histoires toutes faites, **Créer la mienne**, ou **J'ai ma propre idée**.

- **Les histoires toutes faites** comportent chacune au moins un vrai choix pour le joueur : *La Lande maudite* (suivre des indices, puis accuser quelqu'un), *Le Long Siège* (se préparer, puis survivre un certain nombre de jours) et *Le Serment de la frontière* (prendre une ville, choisir comment traiter ses habitants, puis affronter un seigneur de guerre).
- **Créer la mienne** vous permet d'empiler des étapes : une introduction, la visite de lieux, la capture d'une ville, la défaite d'une armée, la collecte d'or, l'attente d'un nombre de jours, une récompense et des choix du joueur. Une fin est ajoutée pour vous et réagit aux choix.
- **J'ai ma propre idée** transforme quelques phrases de votre cru, dans n'importe quelle langue, en une histoire du même genre. Cela exige l'auteur de texte (voir plus bas).

## Désigner des éléments de votre carte

Chaque histoire demande quelques éléments de votre carte, comme une ville à capturer ou des lieux à visiter. L'assistant remplit des suggestions que vous pouvez simplement accepter. Pour en changer une, cherchez par nom ou utilisez le bouton épingle pour cliquer sur l'élément dans la grille de carte.

> **Note:** Seuls les objets, villes et armées qui ont un nom (un identifiant d'entité) sur la carte peuvent être choisis. Nommez-les d'abord dans l'éditeur de cartes du jeu.

## Les choix du joueur

Un choix est un dialogue avec deux à quatre réponses. Chaque réponse peut modifier un compteur, donner ou retirer de l'or, et affiche son propre texte de suite. Certaines réponses ne sont proposées que si le joueur a assez d'or.

Les étapes suivantes lisent ce qui a été choisi. La fin, par exemple, peut différer selon le nombre de réponses clémentes ou cruelles données par le joueur. C'est le schéma « embrancher, suivre, récompenser » : le choix fixe un compteur, et quelque chose le vérifie plus tard.

Les nombres derrière l'histoire sont de simples compteurs (voir *Compteurs et suivi*). L'assistant les affiche par leur nom (en anglais), comme « Mercy » ou « Clues found », tandis que les compteurs eux-mêmes reçoivent des identifiants qui commencent par le nom de votre carte et de l'histoire.

## Le texte

Chaque ligne de texte peut être modifiée dans l'aperçu avant que quoi que ce soit ne soit ajouté. **Autre** donne une version différente d'une ligne, et **Tout réécrire** refait toute l'histoire. Modifiez librement : le texte finit sous forme de jetons de localisation, vous pouvez donc aussi le changer plus tard dans l'éditeur de localisation.

Sans aucune configuration, le texte vient de formulations intégrées dans quatre tons (héroïque, sombre, humoristique, mystérieux). C'est très bien pour essayer une histoire. Les réponses sont génériques selon leur genre (audacieuse, prudente, clémente, etc.).

## L'auteur de texte (facultatif, application de bureau)

Avec une clé gratuite de Google Gemini ou de Groq, le texte est écrit pour s'adapter à votre histoire et aux noms de votre carte, vous pouvez écrire dans l'une des 16 langues du jeu, et **J'ai ma propre idée** devient disponible.

Configurez-le depuis le premier écran du Créateur d'histoires : choisissez un service, collez votre clé et acceptez l'avis. La clé est conservée dans le magasin d'identifiants de votre système d'exploitation, pas dans le projet.

- Le texte que vous générez, ainsi que toute idée d'histoire que vous saisissez, est envoyé au service choisi. Les offres gratuites peuvent l'utiliser pour améliorer leurs modèles : n'y mettez rien de privé.
- Si le service est injoignable, si la clé est refusée ou si la limite gratuite est atteinte, le texte intégré est utilisé et l'histoire fonctionne quand même.
- Choisissez une langue dans **Écrire en** sur le premier écran. L'anglais est toujours créé aussi, pour que le jeu puisse s'y rabattre ; les deux sont affichés côte à côte. Les langues que vous ajoutez sont des brouillons traduits : relisez-les avant de publier.

> **Warning:** Un texte écrit ou traduit par une machine peut être faux ou maladroit. Relisez toujours l'aperçu, surtout dans les langues que vous ne parlez pas.

## Avant de publier

- Sauvegarder ou Publier intègre les quêtes de l'histoire dans le `.map`, comme n'importe quelles autres quêtes.
- Les ID de dialogue et les textes sont partagés par toutes les cartes et tous les zips du jeu. L'histoire préfixe tout avec le nom de votre carte ; la liste des problèmes signale les ID de dialogue qui ne commencent pas par lui.
- Testez l'histoire dans le jeu. Deux détails méritent d'être surveillés : une étape peut commencer au tour qui suit celui où la précédente s'est terminée, et la fin utilise la fermeture du dernier dialogue pour donner la victoire au joueur.

> **Note:** Si un compteur est modifié mais jamais vérifié, ou vérifié mais jamais modifié, la liste des problèmes le signale. Après avoir modifié une histoire à la main, regardez-la en premier.
