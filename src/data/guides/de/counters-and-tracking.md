---
title: Zähler und Fortschrittsverfolgung
category: concepts
order: 2
---

## Was Zähler sind

Zähler sind Ganzzahl-Variablen, die am Szenario hängen. Sie werden im Reiter **Zähler** mit einer SID und einem Anfangswert deklariert und bleiben während der gesamten Lebensdauer der Karte bestehen.

Sie sind das wichtigste Werkzeug, um Aufgabenfortschritt, Kill-Zahlen, Ressourcen-Meilensteine und verzweigte Logik zu verfolgen.

## Einen Zähler deklarieren

Fügen Sie im Reiter Zähler einen Zähler hinzu. Legen Sie fest:
- `sid` — eine eindeutige Zeichenketten-Kennung, z. B. `dragons_killed`
- `value` — Startwert, fast immer `0`

Verwenden Sie aussagekräftige SIDs — Sie verweisen in Ihrer Auslöserlogik immer wieder namentlich darauf.

> **Note:** Zähler werden im Karteneditor nicht angezeigt. Sie existieren nur in der JSON und sind unsichtbar, bis die Karte im Spiel läuft.

## Zähler verändern

Vier Aktionen ändern Zählerwerte:

- `CounterSet` — setzt auf einen bestimmten Wert
- `CounterPlus` — erhöht um einen Betrag
- `CounterMinus` — verringert um einen Betrag
- `CounterSetRandom` — setzt auf einen Zufallswert zwischen Minimum und Maximum

## Zähler prüfen

Verwenden Sie die Bedingung `Counter`, um den Wert eines Zählers zu vergleichen:

- `quest_stage = 2` — genau bei Stufe 2
- `dragons_killed >= 5` — mindestens 5 getötet
- `quest_stage != 0` — die Aufgabe hat begonnen

## Das Aufgabenstufen-Muster

Das häufigste Zählermuster ist ein **Aufgabenstufen-Zähler**:

1. Fügen Sie einen Zähler `quest_main_stage` mit dem Anfangswert `0` hinzu
2. Führen Sie bei jedem Stufenabschluss `CounterSet quest_main_stage → N` aus
3. Sichern Sie den nächsten Auslöser mit `Counter: quest_main_stage = N` ab

So feuern die Stufen der Reihe nach und nur einmal.

## Das Kill-Zähler-Muster

Um zu verlangen, dass N von etwas getötet werden:

1. Fügen Sie einen Zähler `kills_count` mit dem Anfangswert `0` hinzu
2. Fügen Sie einen `UnitKill`-Auslöser mit der Aktion `CounterPlus kills_count 1` hinzu — setzen Sie `repeat: true`
3. Fügen Sie einen zweiten Auslöser hinzu: Bei `Counter: kills_count >= N` wird der Abschluss ausgelöst

Alternativ können Sie das eingebaute Zusatzfeld „Zähler“ der Bedingung `UnitKill` nutzen, um den Schwellenwert direkt ohne separaten Zähler festzulegen.

## Zufällige Verzweigung

Verwenden Sie `CounterSetRandom`, um zufällig zu verzweigen:

1. Setzen Sie den Zähler `branch` auf einen Zufallswert zwischen 1 und 3
2. Fügen Sie drei separate Auslöser hinzu, die jeweils `Counter: branch = 1`, `= 2`, `= 3` prüfen
3. Jeder Zweig löst einen anderen Dialog oder ein anderes Ergebnis aus

Gut für beiläufige Ereignisse und abwechslungsreiche Zufallsbegegnungen.
