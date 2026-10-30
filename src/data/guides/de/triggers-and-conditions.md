---
title: Auslöser und Bedingungen
category: concepts
order: 1
---

## Wie Auslöser funktionieren

Ein Auslöser sitzt innerhalb einer Teilaufgabe. Jeder Auslöser lauscht auf seine Bedingungen und feuert seine Aktionen, wenn sie erfüllt sind. Ein Auslöser feuert standardmäßig **einmal** und wird danach deaktiviert. Setzen Sie `repeat: true` für fortlaufende Auslöser (z. B. wöchentliche Ressourcenzuteilungen).

> **Note:** Auslöser werden nicht bei jedem Spiel-Tick fortlaufend ausgewertet. Bedingungen sind **einmalige Listener** — jede Bedingung feuert in dem Moment, in dem ihre Anforderung zum ersten Mal erfüllt ist, und deaktiviert sich dann dauerhaft. Eine Bedingung aktiviert sich nicht von selbst wieder und feuert nicht erneut, auch wenn die Anforderung später nicht mehr erfüllt ist.

## Bedingungen sind einmalige Listener

Das ist die wichtigste Regel, die Sie verinnerlichen sollten: **Jede Bedingung ist ein einmaliger Ereignis-Listener, keine fortlaufende Zustandsprüfung.**

Wird die Anforderung einer Bedingung zum ersten Mal erfüllt, feuert sie — und schaltet sich dann ab. Sie feuert nie wieder, es sei denn, der Auslöser wird von Grund auf neu ausgewertet (z. B. über `TriggerClear`).

Beispiel: Eine Bedingung `Counter` mit `quest_stage >= 2`, die bereits gefeuert hat, erkennt *nicht*, wenn `quest_stage` später wieder unter 2 fällt. Sie hat einmal gefeuert; damit ist sie erledigt.

> **Note:** Das gilt für alle Bedingungen. Planen Sie Ihre Logik um den Moment, in dem sich ein Zustand ändert, nicht um einen fortdauernden Zustand.

## UND- und ODER-Logik

Jeder Auslöser hat die Einstellung `conditionsLogic`: **OR** (eine beliebige Bedingung muss feuern) oder **AND** (alle Bedingungen müssen jeweils mindestens einmal feuern).

Für komplexe Logik — z. B. „(A und B) oder C“ — verwenden Sie mehrere Auslöser mit getrennten Bedingungssätzen.

### UND-Logik und das TriggerClear-Problem

Da Bedingungen einmalige Listener sind, feuert die **AND**-Logik, sobald jede Bedingung einmal gefeuert hat — selbst wenn sie nie gleichzeitig eintraten. Verlangt Ihr Auslöser etwa „Spieler besitzt Stadt A **UND** Spieler besitzt Stadt B“, feuert jede Besitzbedingung unabhängig, wenn sie erstmals erfüllt ist. Solange beide irgendwann feuern (in beliebiger Reihenfolge), wird der Auslöser ausgeführt.

Das kann unerwartete Ergebnisse liefern, wenn eine Bedingung feuert und dann „ungültig“ wird (z. B. der Spieler verliert die Stadt sofort wieder). Um alle Bedingungen eines Auslösers zurückzusetzen und neu zu beginnen, verwenden Sie die Aktionen **`TriggerClear`** oder **`TriggerClearCustom`**, die den Feuer-Zustand der Bedingungen in einem angegebenen Auslöser löschen.

## Bedingungen werden nur für aktive Aufgabenbesitzer geprüft

Bedingungen werden nur für Spieler ausgewertet, bei denen die Aufgabe, die sie enthält, aktiv ist. Welche Spieler eine Aufgabe haben, bestimmt das Feld `sharing` der Aufgabe. Eine Bedingung *kann* sich jedoch trotzdem auf Helden oder Objekte anderer Spieler beziehen — wenn deren bestimmte Entitäts-SIDs in den Parametern verwendet werden.

## Ereignisbasierte Bedingungen

Diese Bedingungen feuern, wenn ein bestimmtes Ereignis eintritt:

- `SquadKill` — ein neutraler Trupp wird besiegt
- `HeroKill` — ein bestimmter Held wird besiegt
- `SquadInteraction` — der Spieler nähert sich einem neutralen Trupp
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — der Spieler interagiert mit einem Kartenobjekt
- `ObjectLose` — der Spieler verliert ein erobertbares Objekt
- `ObjectCaptureEntity` — der Spieler erobert ein Objekt
- `NodeRevealed` — an einem Knoten wird der Nebel des Krieges gelichtet
- `PlayerDefeated` — ein Spieler wird ausgeschaltet

## Zustandsbasierte Bedingungen

Diese Bedingungen prüfen den aktuellen Spielzustand in dem Moment, in dem sie erstmals ausgewertet werden:

- `Counter` — prüft den Wert eines Zählers: `quest_stage >= 2`
- `UnitOwnSide` / `UnitOwnHero` — prüft Einheitenzahlen in Armeen
- `ResCounter` — prüft den Ressourcenvorrat
- `ItemOwnSide` — prüft den Artefaktbesitz
- `DifficultyCustomMap` — prüft die Schwierigkeitseinstellung der Karte (Index 0–4)

## Zeitbasierte Bedingungen

Diese Bedingungen feuern zu bestimmten Zeitpunkten:

- `StartTurn` — feuert zu Beginn einer bestimmten Woche/eines bestimmten Tages für einen bestimmten Spieler. Parameter: `weekNumber`, `dayNumber`. Nutzen Sie stattdessen das Zusatzfeld `counter` für „nach insgesamt X Tagen“.
- `StartWeek` — feuert zu Beginn einer beliebigen Woche (alle 7 Züge). Keine erforderlichen Parameter; unterstützt das optionale Zusatzfeld `counter`.
- `AnyStartTurn` — feuert zu Beginn des Zuges eines beliebigen Spielers. Parameter: `month`, `week`, `day` (-1 für beliebig).

## Das Zusatzfeld counter

Manche Bedingungen (`UnitKill`, `UnitLose`, `UnitHire`, `StartTurn`, `StartWeek`) haben ein zusätzliches Feld **Counter**. Es legt einen Schwellenwert fest: Die Bedingung feuert erst, nachdem sie N-mal erfüllt wurde.

Beispiel: `UnitKill` mit `counter: 10` feuert erst, nachdem 10 Einheiten dieses Typs getötet wurden.

> **Note:** Dieses Counter-Feld ist vom System der Zähler-SIDs getrennt — es ist eine rohe Zahl, kein Verweis auf einen benannten Zähler.

## Keine Bedingungen

Ein Auslöser ohne Bedingungen feuert sofort, wenn die Teilaufgabe aktiv wird. Nutzen Sie dies für Aktionen „bei Aufgabenbeginn“, etwa einen Einleitungsdialog zu zeigen oder Aufgabenmarkierungen zu setzen.

> **Warning:** Ein Auslöser ohne Bedingungen zusammen mit `repeat: true` feuert bei jedem Tick. Das ist fast nie gewollt.
