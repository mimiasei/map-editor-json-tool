---
title: So funktionieren Aufgaben
category: getting-started
order: 1
---

## Die Hierarchie

Eine Szenariodatei enthält drei Arrays der obersten Ebene: `counters`, `quests` und `interruptions`.

Jede **Aufgabe** hat eine oder mehrere **Teilaufgaben**. Jede Teilaufgabe hat einen oder mehrere **Auslöser**. Jeder Auslöser hat **Bedingungen** und **Aktionen**.

Sind die Bedingungen eines Auslösers erfüllt, feuern seine Aktionen.

## Aufgaben

Eine Aufgabe ist der Container der obersten Ebene. Sie erscheint im Aufgabenbuch des Spiels. Ihre Felder `name` und `description` sind Lokalisierungs-SIDs — sie müssen passende Tokens in der `customMaps.json` Ihrer Karte haben.

Eine Aufgabe ist beim Spielstart aktiv, sofern Sie nicht `activeOnStart: false` setzen.

> **Note:** Aufgabennamen und -beschreibungen werden dem Spieler angezeigt. Sie müssen lokalisiert sein — Rohtext erscheint nicht im Aufgabenbuch.

## Aufgaben-Flags: main, hidden, sharing

Drei optionale Flags einer Aufgabe ändern, wie das Spiel sie behandelt.

**`main: true`** markiert eine Aufgabe als Hauptziel der Karte. Im Aufgabenbuch des Spiels wird sie als Haupt-/Primäraufgabe statt als Nebenziel angezeigt. In den offiziellen Szenariodateien ist es bei Aufgaben wie `main_quest_line` und `city_attack_quest_line_starter` gesetzt — den Aufgaben, auf die sich der Spieler konzentrieren soll. Nebenaufgaben, KI-Verhaltensaufgaben und Hintergrund-Verfolgungsaufgaben lassen es ungesetzt (Standard `false`).

**`hidden: true`** verbirgt die Aufgabe vollständig vor dem Aufgabenbuch des Spielers. Nutzen Sie dies für Aufgaben, die rein für interne Logik existieren — KI-Bewegungsskripte, Hintergrund-Timer, Niederlagebedingungen —, die der Spieler nie sehen soll.

**`sharing`** steuert, wie die Aufgabe im Mehrspielermodus verteilt wird. In den offiziellen Szenariodateien kommen zwei Werte vor:

- `"Clone"` — jeder Spieler erhält seine eigene, unabhängige Kopie der Aufgabe. Der Fortschritt wird pro Spieler getrennt verfolgt. Dies ist der Standard für alle normalen Aufgaben — Spieler-gegen-Spieler-Aufgaben, Nebenaufgaben, Ziele usw.
- `"Ai"` — die Aufgabe wird nur für KI-gesteuerte Spieler ausgewertet. Wird bei versteckten Aufgaben verwendet, die das Verhalten von KI-Helden skripten (z. B. Patrouillenrouten, Bewegungsmuster). Menschliche Spieler haben mit diesen Aufgaben nie zu tun.

> **Note:** `sharing` wird von der Spiel-Engine verlangt — setzen Sie es immer. Der Editor setzt neue Aufgaben standardmäßig auf `"Clone"`, was für alle spielersichtbaren Aufgaben korrekt ist.

## Aufgabenisolierung

Der Inhalt jeder Aufgabe ist vollständig von allen anderen Aufgaben isoliert. Das heißt, Entitäts-SIDs, Zählerverweise und andere Kennungen können sich in verschiedenen Aufgaben wiederholen, ohne Konflikte zu verursachen.

## Teilaufgaben

Teilaufgaben sind die Stufen innerhalb einer Aufgabe. Eine einfache Aufgabe hat womöglich nur eine Teilaufgabe. Eine mehrstufige Aufgabe (z. B. „finde drei Relikte“) hat mehrere Teilaufgaben, die der Reihe nach aktiviert werden.

Verwenden Sie die Aktionen `CurrentSubQuestDone` oder `SubQuestDone`, um eine Teilaufgabe abzuschließen und zur nächsten zu wechseln.

## Teilaufgabengruppen — parallele Schritte

Teilaufgaben lassen sich zu **Teilaufgabengruppen** zusammenfassen. So kann das Spiel mehrere parallele Schritte als eine Einheit behandeln — der nächste Schritt wird erst freigeschaltet, wenn alle erledigt sind.

**Beispiel:** Teilaufgabe 3 „Besiege den Endgegner“ soll erst aktiv werden, nachdem der Spieler sowohl Teilaufgabe 1 „Finde das legendäre Schwert“ ALS AUCH Teilaufgabe 2 „Finde den legendären Schild“ abgeschlossen hat.

Statt versteckte Hilfsaufgaben zur Verfolgung anzulegen, können Sie:

1. Eine Teilaufgabengruppe definieren (z. B. `subquest_group_relics`)
2. Teilaufgabe 1 und Teilaufgabe 2 ihr zuweisen
3. Beide Teilaufgaben mit `NextAfterGroup` statt `NextSubQuest` beenden und die Gruppen-SID sowie die SID der Zielteilaufgabe als Parameter übergeben

Teilaufgabe 3 wird erst aktiv, nachdem beide Teilaufgaben der Gruppe `NextAfterGroup` aufgerufen haben.

> **Note:** Dies wird über die Aktionen `NextAfterGroup` oder `NextQuestAfterGroup` konfiguriert. Die Gruppen-SID ist im Abschnitt `subQuestGroups` der Aufgabe definiert.

## Auslöser

Auslöser sind die Logikeinheiten. Jeder Auslöser lauscht auf seine Bedingungen und feuert seine Aktionen, wenn sie erfüllt sind.

Ein Auslöser feuert standardmäßig **einmal**. Setzen Sie `repeat: true`, damit er jedes Mal feuert, wenn die Bedingungen erfüllt werden.

> **Warning:** Wiederholende Auslöser ohne Bedingungen (oder mit immer wahren Bedingungen) feuern bei jedem Spiel-Tick. Sichern Sie wiederholende Auslöser immer mit mindestens einer Zähler- oder Zustandsprüfung ab.

## Ausführungsreihenfolge der Auslöser

Feuern mehrere Auslöser derselben Teilaufgabe gleichzeitig, werden ihre Aktionen in Deklarationsreihenfolge ausgeführt: Zuerst laufen alle Aktionen des ersten Auslösers, dann alle des zweiten und so weiter. Beachten Sie dies, wenn die Aktionen eines Auslösers die Bedingungen eines anderen Auslösers derselben Teilaufgabe beeinflussen.

## Entitäts-SIDs — Auslöser mit Kartenobjekten verknüpfen

Viele Bedingungen und Aktionen müssen auf ein **bestimmtes, auf der Karte platziertes Objekt** verweisen — einen neutralen Stapel, eine Stadt, einen Helden, einen Ressourcenhaufen, ein Portal usw. Dies geschieht über eine **Entitäts-SID**.

Im Karteneditor hat jedes interaktive Objekt in seinem Eigenschaftenbereich ein Feld **Entität**. Wird dieses Feld gesetzt, erhält genau diese platzierte Instanz eine eindeutige Kennung, getrennt von ihrem Typ. Ein in der Nähe der Startstadt platzierter Drachenstapel könnte etwa die Entitäts-SID `E_Squad_Dragon` erhalten. Ein Portal könnte `portal_south` heißen.

Diese Entitäts-SID tragen Sie in den jeweiligen Parameter in diesem Editor ein. Zum Beispiel:

- Bedingung `SquadKill` — tragen Sie die Entitäts-SID des platzierten neutralen Stapels ein
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — tragen Sie die Entitäts-SID des Kartenobjekts ein, auf das der Spieler tritt
- Aktion `DeleteEntity` — tragen Sie die Entitäts-SID des zu entfernenden Objekts ein
- Aktion `SetQuestMarker` — tragen Sie die Entitäts-SID des zu markierenden Objekts ein

> **Note:** Entitäts-SIDs sind nicht dasselbe wie Typ-SIDs. `E_Squad_Dragon` ist die *platzierte Instanz* eines Stapels; `Dragon` ist der Einheitentyp. Verwenden Sie immer die Entitäts-SID (aus dem Feld Entität des Karteneditors), wenn eine Bedingung oder Aktion einen Objektverweis verlangt.

## Bedingungen

Bedingungen werden mit UND- oder ODER-Logik kombiniert (pro Auslöser festgelegt). Sind keine Bedingungen vorhanden, feuert der Auslöser sofort, wenn die Teilaufgabe aktiv ist.

Eine vollständige Aufschlüsselung finden Sie unter [Auslöser und Bedingungen](guide:triggers-and-conditions).

## Aktionen

Aktionen werden der Reihe nach ausgeführt, wenn alle Bedingungen erfüllt sind. Häufige Aktionen: einen Dialog zeigen, eine Teilaufgabe abschließen, zur nächsten Aufgabe vorrücken, dem Spieler Ressourcen oder Gegenstände geben oder Sieg/Niederlage auslösen.

## Zähler

Zähler sind Ganzzahl-Variablen, die für die Lebensdauer der Karte bestehen bleiben. Sie werden im Reiter Zähler deklariert und über ihre SID referenziert.

Nutzen Sie sie, um Aufgabenstufen, Kill-Zahlen, Ressourcenschwellen und mehr zu verfolgen. Siehe [Zähler und Fortschrittsverfolgung](guide:counters-and-tracking).

## Unterbrechungen

Unterbrechungen sind Hooks im Lebenszyklus eines Kampfes — sie feuern bei bestimmten Heldenkampf-Ereignissen, etwa bevor der Spieler gegen einen gegnerischen Helden kämpft oder nachdem er einen Held-gegen-Held-Kampf gewonnen hat. Es gibt keine Bedingungen zu konfigurieren; der Ereignistyp selbst bestimmt, wann sie feuern.

Nutzen Sie sie für Dialoge vor dem Kampf, Belohnungen nach dem Kampf und Bosskampf-Sequenzen. Sie lassen sich zur Laufzeit über die Aktionen `EnableInterruption` und `DisableInterruption` ein- und ausschalten.

Eine vollständige Aufschlüsselung finden Sie unter [Unterbrechungen](guide:interruptions).
