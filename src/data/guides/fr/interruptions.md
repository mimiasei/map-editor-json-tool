---
title: Interruptions
category: concepts
order: 3
---

## Ce que sont les interruptions

Les interruptions sont le troisième tableau de premier niveau d'un fichier de scénario, à côté de `counters` et `quests`. Ce sont des **points d'accroche dans le déroulement des combats** : elles se déclenchent lors d'événements précis d'un combat entre héros, et non quand des conditions sont remplies.

Une interruption comporte :
- `sid` : un identifiant unique, utilisé par `EnableInterruption` / `DisableInterruption`
- `interruption` : le type d'événement qui la déclenche (voir ci-dessous)
- `activeOnStart` : si elle est active au chargement de la carte
- `p` : des paramètres (en général le SID d'entité d'un héros, pour restreindre le point d'accroche)
- `actions` : ce qui s'exécute quand l'événement se produit (les mêmes types d'actions que les déclencheurs de quête)

## Les interruptions se déclenchent un nombre illimité de fois

Contrairement aux déclencheurs de quête (qui se déclenchent une seule fois par défaut), **une interruption se déclenche chaque fois que son événement se produit, sans limite, jusqu'à ce qu'on la désactive explicitement** avec `DisableInterruption`. Si vous voulez qu'elle ne se déclenche qu'une fois, désactivez-la depuis sa propre liste d'actions.

## Les types d'interruptions

| Type | Se déclenche quand |
|----------------------|---------------------------------------------------------------|
| `BeforeIamVsHero` | Avant le combat : le héros du joueur va affronter un héros ennemi |
| `AfterIamWinVsHero` | Après la victoire du héros du joueur contre un héros ennemi |
| `BeforeHeroVsHero` | Avant tout combat héros contre héros (quel que soit le joueur) |
| `AfterHeroWinVsHero` | Après la victoire d'un héros lors d'un combat héros contre héros |

Le tableau `p` restreint le point d'accroche à des héros précis. Par exemple, régler `p` sur `['E_Hero_Xarfax']` pour une interruption `BeforeIamVsHero` la fait se déclencher uniquement quand le héros du joueur va affronter Xarfax, et non chaque héros ennemi.

> **Note:** Contrairement aux déclencheurs de quête, les interruptions n'ont aucune condition à configurer. Le type `interruption` est la condition. Le moteur décide quand la déclencher.

## En quoi les interruptions diffèrent des déclencheurs de quête

Les déclencheurs de quête évaluent des conditions et se déclenchent quand elles sont remplies. Les interruptions sont différentes : le jeu les appelle à des moments précis du déroulement du combat, avant ou après la résolution du combat.

Point crucial : **les interruptions sont le seul moyen de suspendre la logique normale du jeu**, par exemple pour empêcher le lancement automatique du combat quand un héros marche sur un ennemi. Un déclencheur de quête qui se déclenche au même moment ne peut pas le faire : ses actions s'exécutent mais n'interrompent pas le déroulement du combat. Une interruption `BeforeIamVsHero` peut afficher un dialogue avant même que l'écran de combat ne se charge.

Cela rend les interruptions indispensables pour :
- **Des rencontres pacifiques** : empêcher le combat de commencer et afficher un dialogue à la place
- **De l'ambiance d'avant-combat** : la provocation d'un méchant avant le combat
- **Des récompenses d'après-combat** : donner des objets ou faire avancer des quêtes après un combat précis

## Cas d'usage courants

**Dialogue d'avant-combat (provocation d'un méchant)**

Afficher un dialogue avant que le joueur n'affronte un héros ennemi important :

1. Ajoutez une interruption de type `BeforeIamVsHero`
2. Réglez `p` sur le SID d'entité du héros ennemi
3. Réglez `activeOnStart: true`
4. Ajoutez une action `Dialog`

Le dialogue se déclenche à l'instant où le joueur clique pour attaquer ce héros, avant le chargement de l'écran de combat.

**Récompense d'après-combat et progression de la quête**

Après la défaite d'un héros boss par le joueur, faire avancer la quête et donner une récompense :

1. Ajoutez une interruption de type `AfterIamWinVsHero`
2. Réglez `p` sur le SID d'entité du héros boss
3. Ajoutez les actions : `Dialog` (discours de victoire), `GiveRes` (récompense), `CurrentSubQuestDone` ou `CounterSet`

> **Warning:** `AfterIamWinVsHero` se déclenche quand le joueur gagne. Si le joueur perd le combat, elle ne se déclenche pas. Ne vous en servez pas pour une logique « le combat a eu lieu », seulement pour « le joueur a gagné ».

**Combat contre un boss (avant + après combinés)**

Pour un combat de boss complet, associez deux interruptions sur le même SID de héros :

- `BeforeIamVsHero` → dialogue de provocation
- `AfterIamWinVsHero` → récompense + progression de la quête

**Ne se déclencher qu'une fois**

Si vous voulez que l'interruption ne se déclenche que la première fois que le joueur rencontre le héros :

1. Réglez `activeOnStart: true`
2. En dernière action de l'interruption, ajoutez `DisableInterruption` avec le SID de l'interruption elle-même

**Activation conditionnelle**

Si l'interruption ne doit être active que pendant une certaine étape de quête, réglez `activeOnStart: false` et activez-la depuis un déclencheur de quête :

1. Dans un déclencheur de quête, ajoutez `EnableInterruption` avec le SID de l'interruption
2. Après la résolution du combat (ou lors d'un changement d'étape de quête), ajoutez `DisableInterruption` pour nettoyer

Cela empêche l'interruption de se déclencher avant ou après la fenêtre prévue.

## Paramètres (p)

La signification du tableau `p` dépend du type. Pour les quatre types connus, `p[0]` est le **SID d'entité du héros** : le héros précis auquel l'interruption est restreinte. Si `p` est vide, l'interruption se déclenche pour n'importe quel héros correspondant au type.

> **Note:** Les SID d'entité des héros se définissent dans l'éditeur de cartes quand vous placez un héros sur la carte. Ils ressemblent à `E_Hero_Xarfax` ou `E_Hero_SomeVillain`. Consultez le panneau de propriétés de l'éditeur de cartes pour le héros placé.

## Activer et désactiver à l'exécution

Utilisez les actions `EnableInterruption` et `DisableInterruption` (disponibles dans n'importe quel déclencheur de quête ou dans la liste d'actions d'une autre interruption) pour activer et désactiver des interruptions :

- `EnableInterruption` : active l'interruption, qui se déclenchera lors du prochain événement correspondant
- `DisableInterruption` : la désactive, elle ne se déclenchera plus tant qu'elle n'est pas réactivée

Les deux actions prennent le `sid` de l'interruption comme paramètre.
