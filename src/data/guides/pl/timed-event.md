---
title: Zdarzenia czasowe
category: recipes
order: 2
---

## Przegląd

Zdarzenia czasowe uruchamiają się po upływie określonej liczby tur. Przydają się do:

- Zadań z terminem („pokonaj wroga w ciągu 20 tur albo przegraj”)
- Okresowych posiłków („co tydzień gracz otrzymuje 3 łuczników”)
- Narastających zagrożeń („jeśli zadanie nie zostanie wykonane do tury 15, pojawia się silniejszy wróg”)

## Termin oparty na turze

Aby coś uruchomić w konkretnej turze:

1. Dodaj wyzwalacz z warunkiem `StartTurn`
2. Ustaw **Turn number** na żądaną turę (np. `15`)
3. Ustaw **Player** na `1` (pierwszy gracz)
4. Dodaj swoje akcje (np. `Dialog`, `GameLose`, `SpawnHero`)

## Wzorzec licznika tur

Dla bardziej elastycznego odmierzania czasu — np. „po rozpoczęciu zadania poczekaj 10 tur”:

1. Gdy zadanie się zaczyna, użyj `CounterSet turn_timer 0`
2. Dodaj powtarzalny wyzwalacz z `StartTurn` (bez parametrów) i `CounterPlus turn_timer 1`
3. Zabezpiecz wyzwalacz terminu warunkiem `Counter: turn_timer >= 10`

Mierzy to liczbę tur, które upłynęły od początku zadania, a nie bezwzględny numer tury.

## Zdarzenia cotygodniowe

Aby coś uruchamiać co tydzień:

1. Dodaj wyzwalacz z warunkiem `StartWeek`
2. Ustaw `repeat: true`
3. Dodaj swoje akcje (np. `GiveRes gold 200`)

Uruchamia się to automatycznie co 7 tur przez cały czas trwania mapy.

> **Warning:** Cotygodniowe wyzwalacze powtarzalne bez zabezpieczenia licznikiem uruchamiają się w nieskończoność. Jeśli mają się zatrzymać po N tygodniach, dodaj licznik, zwiększaj go co tydzień i zabezpiecz warunkiem `Counter: weeks_elapsed < N`.

## Przerwania a czas walki

Przerwania nie są oparte na czasie — to haki cyklu życia walki (`BeforeIamVsHero`, `AfterIamWinVsHero` itd.). Przydają się, gdy coś ma się wydarzyć przy konkretnej bitwie bohaterów, a nie w konkretnej turze.

Do czasomierzy opartych na turach używaj wyzwalaczy zadań z warunkami `StartTurn` lub `StartWeek`, jak opisano wyżej. Do czego naprawdę służą przerwania, przeczytasz w [Przerwaniach](guide:interruptions).
