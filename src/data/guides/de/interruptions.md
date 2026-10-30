---
title: Unterbrechungen
category: concepts
order: 3
---

## Was Unterbrechungen sind

Unterbrechungen sind das dritte Array der obersten Ebene in einer Szenariodatei, neben `counters` und `quests`. Sie sind **Hooks im Lebenszyklus eines Kampfes** — sie feuern bei bestimmten Heldenkampf-Ereignissen, nicht wenn Bedingungen erfüllt sind.

Eine Unterbrechung hat:
- `sid` — eindeutige Kennung, die von `EnableInterruption` / `DisableInterruption` verwendet wird
- `interruption` — der Ereignistyp, der sie auslöst (siehe unten)
- `activeOnStart` — ob sie beim Laden der Karte aktiv ist
- `p` — Parameter (typischerweise eine Helden-Entitäts-SID, um den Hook einzugrenzen)
- `actions` — was läuft, wenn das Ereignis feuert (dieselben Aktionstypen wie bei Aufgabenauslösern)

## Unterbrechungen feuern unbegrenzt oft

Anders als Aufgabenauslöser (die standardmäßig einmal feuern) **feuert eine Unterbrechung jedes Mal, wenn ihr Ereignis eintritt, ohne Limit, bis sie ausdrücklich über `DisableInterruption` deaktiviert wird**. Soll sie nur einmal feuern, deaktivieren Sie sie aus ihrer eigenen Aktionsliste heraus.

## Unterbrechungstypen

| Typ | Feuert, wenn |
|----------------------|---------------------------------------------------------------|
| `BeforeIamVsHero` | Vor dem Kampf — der Held des Spielers will gleich gegen einen gegnerischen Helden kämpfen |
| `AfterIamWinVsHero` | Nachdem der Held des Spielers gegen einen gegnerischen Helden gewonnen hat |
| `BeforeHeroVsHero` | Vor jedem Held-gegen-Held-Kampf (unabhängig davon, wer der Spieler ist) |
| `AfterHeroWinVsHero` | Nachdem ein beliebiger Held einen Held-gegen-Held-Kampf gewonnen hat |

Das Array `p` grenzt den Hook auf bestimmte Helden ein. Setzt man etwa `p` bei einer Unterbrechung `BeforeIamVsHero` auf `['E_Hero_Xarfax']`, feuert sie nur, wenn der Held des Spielers gleich gegen Xarfax kämpfen will — nicht bei jedem gegnerischen Helden.

> **Note:** Anders als Aufgabenauslöser haben Unterbrechungen keine zu konfigurierenden Bedingungen. Der Typ `interruption` ist die Bedingung. Die Engine entscheidet, wann sie feuert.

## Wie sich Unterbrechungen von Aufgabenauslösern unterscheiden

Aufgabenauslöser werten Bedingungen aus und feuern, wenn diese erfüllt sind. Unterbrechungen sind anders: Das Spiel ruft sie zu bestimmten Zeitpunkten im Kampflebenszyklus auf, vor oder nach der Kampfauflösung.

Entscheidend: **Unterbrechungen sind der einzige Weg, die Standardspiellogik anzuhalten** — etwa den automatischen Kampfbeginn zu umgehen, wenn ein Held auf einen Gegner trifft. Ein Aufgabenauslöser, der im selben Moment feuert, kann das nicht; seine Aktionen laufen, unterbrechen aber nicht den Kampfablauf. Eine Unterbrechung mit `BeforeIamVsHero` kann einen Dialog zeigen, noch bevor der Kampfbildschirm lädt.

Damit sind Unterbrechungen unverzichtbar für:
- **Friedliche Begegnungen** — den Kampfbeginn verhindern und stattdessen einen Dialog zeigen
- **Würze vor dem Kampf** — der Spott eines Schurken vor dem Kampf
- **Belohnungen nach dem Kampf** — Gegenstände vergeben oder Aufgaben voranbringen nach einem bestimmten Kampf

## Häufige Anwendungsfälle

**Dialog vor dem Kampf (Spott des Schurken)**

Einen Dialog zeigen, bevor der Spieler gegen einen wichtigen gegnerischen Helden kämpft:

1. Fügen Sie eine Unterbrechung vom Typ `BeforeIamVsHero` hinzu
2. Setzen Sie `p` auf die Entitäts-SID des gegnerischen Helden
3. Setzen Sie `activeOnStart: true`
4. Fügen Sie eine Aktion `Dialog` hinzu

Der Dialog feuert in dem Moment, in dem der Spieler klickt, um diesen Helden anzugreifen, bevor der Kampfbildschirm lädt.

**Belohnung nach dem Kampf und Aufgabenfortschritt**

Nachdem der Spieler einen Bosshelden besiegt hat, die Aufgabe voranbringen und eine Belohnung geben:

1. Fügen Sie eine Unterbrechung vom Typ `AfterIamWinVsHero` hinzu
2. Setzen Sie `p` auf die Entitäts-SID des Bosshelden
3. Fügen Sie Aktionen hinzu: `Dialog` (Siegesrede), `GiveRes` (Belohnung), `CurrentSubQuestDone` oder `CounterSet`

> **Warning:** `AfterIamWinVsHero` feuert, wenn der Spieler gewinnt. Verliert der Spieler den Kampf, feuert sie nicht. Verlassen Sie sich nicht darauf für Logik „der Kampf hat stattgefunden“ — nur für Logik „der Spieler hat gewonnen“.

**Bossbegegnung (Kombination aus davor + danach)**

Für ein vollständiges Bosskampf-Erlebnis koppeln Sie zwei Unterbrechungen auf dieselbe Helden-SID:

- `BeforeIamVsHero` → Spottdialog
- `AfterIamWinVsHero` → Belohnung + Aufgabenfortschritt

**Nur einmal feuern**

Soll die Unterbrechung nur bei der ersten Begegnung des Spielers mit dem Helden auslösen:

1. Setzen Sie `activeOnStart: true`
2. Fügen Sie als letzte Aktion der Unterbrechung `DisableInterruption` mit der eigenen SID der Unterbrechung hinzu

**Bedingte Aktivierung**

Soll die Unterbrechung nur in einer bestimmten Aufgabenstufe aktiv sein, setzen Sie `activeOnStart: false` und aktivieren Sie sie aus einem Aufgabenauslöser:

1. Fügen Sie in einem Aufgabenauslöser `EnableInterruption` mit der SID der Unterbrechung hinzu
2. Fügen Sie nach der Kampfauflösung (oder bei einem Aufgabenstufenwechsel) `DisableInterruption` zum Aufräumen hinzu

So feuert die Unterbrechung nicht vor oder nach dem vorgesehenen Zeitfenster.

## Parameter (p)

Die Bedeutung des Arrays `p` hängt vom Typ ab. Bei den vier bekannten Typen ist `p[0]` die **Helden-Entitäts-SID** — der bestimmte Held, auf den die Unterbrechung eingegrenzt ist. Ist `p` leer, feuert die Unterbrechung für jeden Helden, der zum Typ passt.

> **Note:** Helden-Entitäts-SIDs werden im Karteneditor festgelegt, wenn Sie einen Helden auf der Karte platzieren. Sie sehen aus wie `E_Hero_Xarfax` oder `E_Hero_SomeVillain`. Sehen Sie im Eigenschaftenbereich des Karteneditors für das platzierte Heldenobjekt nach.

## Zur Laufzeit aktivieren und deaktivieren

Verwenden Sie die Aktionen `EnableInterruption` und `DisableInterruption` (verfügbar in jedem Aufgabenauslöser oder in der Aktionsliste einer anderen Unterbrechung), um Unterbrechungen ein- und auszuschalten:

- `EnableInterruption` — aktiviert die Unterbrechung, sodass sie beim nächsten passenden Ereignis feuert
- `DisableInterruption` — deaktiviert sie, sodass sie nicht mehr feuert, bis sie wieder aktiviert wird

Beide Aktionen nehmen die `sid` der Unterbrechung als Parameter.
