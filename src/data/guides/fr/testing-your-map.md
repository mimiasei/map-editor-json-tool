---
title: Tester votre carte
category: troubleshooting
order: 1
---

## L'éditeur de cartes ne reflète pas les changements du JSON

C'est le point le plus important à comprendre : **les changements que vous faites dans cet éditeur (logique des quêtes, compteurs, déclencheurs) sont invisibles dans l'éditeur de cartes de HoMM:OE.** L'éditeur de cartes n'affiche que la couche visuelle (terrain, objets, héros sur la carte).

Vos changements de JSON sont lus par le **moteur du jeu à l'exécution**, pas par l'éditeur de cartes.

> **Warning:** N'ouvrez pas votre fichier de carte sauvegardé dans l'éditeur de cartes de HoMM:OE en vous attendant à y voir la logique des quêtes : vous n'y verrez que la couche visuelle. Le jeu lit bien le JSON à l'exécution.

## La marche à suivre pour tester

La bonne façon de tester la logique des quêtes :

1. Faites vos changements dans cet éditeur
2. **Sauvegardez sous** (ou exportez) pour obtenir le fichier JSON à jour
3. Remplacez le JSON du scénario dans votre fichier de carte (ou placez-le là où le jeu l'attend)
4. Chargez la carte dans HoMM:OE
5. Testez le scénario concerné dans le jeu
6. Recommencez

## Retrouver le JSON du scénario dans une carte

Un fichier de carte `.homm` est un ZIP. Extrayez-le et cherchez `scenario.json` (ou un fichier au nom proche) à la racine ou dans le dossier `DB/`. Remplacez-le par votre JSON à jour, puis recompressez l'archive.

> **Note:** Gardez une sauvegarde de votre carte d'origine avant de remplacer des fichiers.

## Validez d'abord

Avant de tester dans le jeu, cliquez sur **Valider** dans la barre d'outils. Le validateur détecte :

- les jetons de localisation manquants
- les références à des compteurs qui ne correspondent à aucun compteur déclaré
- les références à des SID de quêtes ou de sous-quêtes inexistants
- les paramètres obligatoires vides

Corrigez toutes les erreurs avant de tester dans le jeu. Les avertissements sont informatifs : le jeu peut tout de même fonctionner correctement.

## Astuces pour itérer vite

- Utilisez `CounterSet` pour avancer rapidement l'état d'une quête dans un déclencheur de test (par ex. mettre `quest_stage` à 5 au tour 1 pour tester la logique de fin de partie)
- Utilisez `SpawnHero` pour placer un héros précis, afin de tester des conditions qui exigent qu'un héros existe
- Utilisez `RevealFogOfWar` au début de la carte avec un grand rayon pour tout voir pendant les tests
