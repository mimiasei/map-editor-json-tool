---
title: Zeitgesteuerte Ereignisse
category: recipes
order: 2
---

## Überblick

Zeitgesteuerte Ereignisse feuern, nachdem eine bestimmte Anzahl Züge vergangen ist. Sie eignen sich für:

- Fristaufgaben („besiege den Feind innerhalb von 20 Zügen oder verliere“)
- Periodische Verstärkungen („jede Woche erhält der Spieler 3 Bogenschützen“)
- Eskalierende Bedrohungen („ist die Aufgabe bis Zug 15 nicht erledigt, erscheint ein stärkerer Feind“)

## Zugbasierte Frist

Um etwas in einem bestimmten Zug auszulösen:

1. Fügen Sie einen Auslöser mit einer Bedingung `StartTurn` hinzu
2. Setzen Sie die **Zugnummer** auf den gewünschten Zug (z. B. `15`)
3. Setzen Sie den **Spieler** auf `1` (erster Spieler)
4. Fügen Sie Ihre Aktionen hinzu (z. B. `Dialog`, `GameLose`, `SpawnHero`)

## Das Zugzähler-Muster

Für flexibleres Timing — z. B. „nach Beginn der Aufgabe 10 Züge warten“:

1. Verwenden Sie bei Beginn der Aufgabe `CounterSet turn_timer 0`
2. Fügen Sie einen wiederholenden Auslöser mit `StartTurn` (ohne Parameter) und `CounterPlus turn_timer 1` hinzu
3. Sichern Sie Ihren Fristauslöser mit `Counter: turn_timer >= 10` ab

Das misst die seit Aufgabenbeginn vergangenen Züge, nicht die absolute Zugnummer.

## Wöchentlich wiederholte Ereignisse

Um etwas jede Woche auszulösen:

1. Fügen Sie einen Auslöser mit einer Bedingung `StartWeek` hinzu
2. Setzen Sie `repeat: true`
3. Fügen Sie Ihre Aktionen hinzu (z. B. `GiveRes gold 200`)

Das feuert automatisch alle 7 Züge für die Dauer der Karte.

> **Warning:** Wöchentlich wiederholende Auslöser ohne Zählerschutz feuern unbegrenzt. Wenn sie nach N Wochen aufhören sollen, fügen Sie einen Zähler hinzu, erhöhen ihn jede Woche und sichern dann mit `Counter: weeks_elapsed < N` ab.

## Unterbrechungen für das Kampf-Timing

Unterbrechungen sind nicht zeitbasiert — sie sind Hooks im Lebenszyklus eines Kampfes (`BeforeIamVsHero`, `AfterIamWinVsHero` usw.). Sie sind nützlich, wenn etwas bei einem bestimmten Heldenkampf statt in einem bestimmten Zug geschehen soll.

Für zugbasierte Umgebungstimer verwenden Sie Aufgabenauslöser mit den Bedingungen `StartTurn` oder `StartWeek`, wie oben beschrieben. Wofür Unterbrechungen tatsächlich gedacht sind, steht unter [Unterbrechungen](guide:interruptions).
