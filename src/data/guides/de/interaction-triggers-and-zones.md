---
title: Interaktionsauslöser & Auslösezonen
category: concepts
order: 4
---

## Was Interaktionsauslöser sind

Interaktionsauslöser sind kurze, einfache Aktionsfolgen, die im Unfrozen-Karteneditor direkt an ein Kartenobjekt gehängt werden. Sie feuern, wenn der Held eines Spielers mit diesem Objekt interagiert — entweder **bevor** die eigene Wirkung des Objekts eintritt (Actions Before) oder **danach** (Actions After).

> **Note:** Interaktionsauslöser werden im Eigenschaftenbereich der Objekte im Unfrozen-Karteneditor konfiguriert — nicht in diesem Werkzeug. Diese Anleitung erklärt ihre Funktionsweise, damit Sie das gesamte Scripting-Bild verstehen und wissen, wann Sie sie statt der Auslöser der Aufgabendatei einsetzen.

## Wie sie sich von Aufgabenauslösern unterscheiden

Der entscheidende Unterschied: **Interaktionsauslöser unterbrechen die Standardspiellogik vollständig.** Ein Aufgabenauslöser führt seine Aktionen aus, kann aber nicht pausieren oder verzögern, was das Spiel in diesem Moment normalerweise tut. Ein Interaktionsauslöser kann das.

Zum Beispiel:
- Ein Aufgabenauslöser, der feuert, wenn der Spieler mit einem Trupp interagiert, kann den Kampfbeginn nicht verhindern — der Dialog öffnet sich und schließt sich sofort wieder, sobald der Kampf beginnt.
- Ein Actions-Before-Auslöser am selben Trupp *kann* einen Dialog zeigen, bevor der Kampfbildschirm lädt. Auch die Todesanimation nach dem Kampf wird erst abgespielt, *nachdem* ein Actions-After-Dialog beendet ist.

Damit sind Interaktionsauslöser das richtige Werkzeug für:
- Dialoge, die vor der Auflösung eines Kampfes oder einer Aufnahme laufen müssen
- Zwischensequenzartige Abläufe bei bestimmten Objektinteraktionen
- Jeden Moment, in dem Sie den normalen Spielablauf anhalten müssen

Für Dialoge bei Held-gegen-Held-Begegnungen verwenden Sie stattdessen [Unterbrechungen](guide:interruptions) — Interaktionsauslöser lassen sich nicht an Helden hängen.

## Actions Before und Actions After

| Eigenschaft | Wann sie feuert |
|---|---|
| Actions Before | Bevor die eigene Wirkung des Objekts abläuft (vor Kampfbeginn, vor dem Einsammeln der Ressource usw.) |
| Actions After | Nachdem die Wirkung des Objekts abgehandelt ist (nach Kampfende, nach der Aufnahme usw.) |

Beide können gleichzeitig am selben Objekt hängen. Die Reihenfolge, in der Aktionen innerhalb jeder Eigenschaft hinzugefügt werden, bestimmt die Ausführungsreihenfolge.

> **Warning:** Werden für eine Aktion weniger oder mehr Parameter gesetzt, als sie akzeptiert, feuert die Aktion nicht. Dies entspricht derselben Regel wie bei Aktionen der Aufgabendatei.

## Das Kontrollkästchen Repeat

Jede Eigenschaft Actions Before / Actions After hat ein Kontrollkästchen **Repeat**. Ist es aktiviert, feuern die Aktionen jedes Mal, wenn ein Held mit dem Objekt interagiert. Ist es deaktiviert (Standard), feuern die Aktionen nur einmal — beim ersten Mal.

## Input sides IDs

Das Feld **input sides IDs** eines Interaktionsauslösers begrenzt, welche Spieler die Aktionen auslösen. Geben Sie Spielerindizes (0-basiert) ein, um den Auslöser einzuschränken. Zum Beispiel bedeutet die Eingabe `1`, dass die Aktionen nur feuern, wenn der Held von Spieler 2 mit dem Objekt interagiert.

Bleibt das Feld leer, feuern die Aktionen für jeden Spieler.

## Auslösezonen

Eine **Auslösezone** ist ein besonderer unsichtbarer Objekttyp, der über das Hauptwerkzeug-Panel des Editors auf der Karte platziert wird. Statt an ein bestimmtes Objekt gehängt zu werden, feuern ihre Aktionen, wenn ein beliebiger Held auf eine ihrer Zellen tritt.

Wichtiges Verhalten laut der offiziellen Anleitung:

- **Die Bewegung wird unterbrochen**, wenn ein Held eine Auslösezone betritt, unabhängig davon, was die angehängte Aktion tut oder ob sie sichtbare Wirkung hat. Schon eine einzelne Aktion `Print` (Ausgabe in der Entwicklerkonsole) hält den Helden mitten im Pfad an.
- **Fliegende Helden** aktivieren die Aktionen einer Auslösezone nicht, wenn sie darüber fliegen und außerhalb ihres Bereichs landen. Sie aktivieren sie, wenn sie innerhalb landen.
- **Das Kontrollkästchen Repeat** einer Auslösezone funktioniert wie bei Objektauslösern. Ohne es feuert die Zone nur beim ersten Betreten. Mit ihm feuert die Zone jedes Mal, wenn ein Held von außen eintritt — aber nicht, solange sich ein Held innerhalb der Zone bewegt.
- **Das Deaktivieren einer Zone** über die Aktion `SetActiveMarker` (oder durch Abwählen von „Activate“ im Editor) verhindert vollständig, dass sie die Heldenbewegung unterbricht.

> **Note:** `SetActiveMarker` ist im Aktionseditor dieses Werkzeugs verfügbar. Nutzen Sie es aus einem Aufgabenauslöser, um Auslösezonen zur Laufzeit dynamisch zu aktivieren oder zu deaktivieren.

## Was dieser Editor übernimmt

Dieser Editor verwaltet die **Aufgabendatei** (`map_name.json`) — die Abschnitte `counters`, `interruptions` und `quests`. Interaktionsauslöser und Auslösezonen werden im **Unfrozen-Karteneditor** an Objekte gehängt und sind nicht Teil der Aufgabendatei.

Sie können jedoch Aktionen dieses Editors nutzen, um zur Laufzeit mit Zonen zu interagieren:
- `SetActiveMarker` — aktiviert oder deaktiviert eine Auslösezone anhand ihrer Entitäts-SID

Den Ansatz über die Aufgabendatei, um die Spiellogik bei Heldenbegegnungen anzuhalten, finden Sie unter [Unterbrechungen](guide:interruptions).
