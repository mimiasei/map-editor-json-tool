---
title: Liczniki i śledzenie
category: concepts
order: 2
---

## Czym są liczniki

Liczniki to zmienne całkowitoliczbowe przypisane do scenariusza. Deklaruje się je na karcie **Liczniki**, podając SID i wartość początkową, i istnieją przez cały czas życia mapy.

Są głównym narzędziem do śledzenia postępu zadań, liczby pokonanych wrogów, progów zasobów i logiki rozgałęzień.

## Deklarowanie licznika

Dodaj licznik na karcie „Liczniki”. Ustaw:
- `sid` — unikalny identyfikator tekstowy, np. `dragons_killed`
- `value` — wartość początkowa, prawie zawsze `0`

Używaj opisowych SID-ów — będziesz się do nich odwoływać po nazwie w całej logice wyzwalaczy.

> **Note:** Liczniki nie są widoczne w edytorze map. Istnieją tylko w JSON-ie i są niewidoczne, dopóki mapa nie zostanie uruchomiona w grze.

## Zmiana liczników

Wartości liczników zmieniają cztery akcje:

- `CounterSet` — ustawia konkretną wartość
- `CounterPlus` — zwiększa o podaną wartość
- `CounterMinus` — zmniejsza o podaną wartość
- `CounterSetRandom` — ustawia losową wartość między minimum a maksimum

## Sprawdzanie liczników

Użyj warunku `Counter`, aby porównać wartość licznika:

- `quest_stage = 2` — dokładnie na etapie 2
- `dragons_killed >= 5` — pokonano co najmniej 5
- `quest_stage != 0` — zadanie się rozpoczęło

## Wzorzec etapu zadania

Najczęstszy wzorzec licznika to **licznik etapu zadania**:

1. Dodaj licznik `quest_main_stage` z wartością początkową `0`
2. Po ukończeniu każdego etapu wykonaj `CounterSet quest_main_stage → N`
3. Zabezpiecz kolejny wyzwalacz warunkiem `Counter: quest_main_stage = N`

Dzięki temu etapy uruchamiają się po kolei i tylko raz.

## Wzorzec liczby pokonanych wrogów

Aby wymagać pokonania N czegoś:

1. Dodaj licznik `kills_count` z wartością początkową `0`
2. Dodaj wyzwalacz `UnitKill` z akcją `CounterPlus kills_count 1` — ustaw `repeat: true`
3. Dodaj drugi wyzwalacz: gdy `Counter: kills_count >= N`, uruchom zakończenie

Można też użyć wbudowanego dodatkowego pola Counter w warunku `UnitKill`, aby ustawić próg bezpośrednio, bez osobnego licznika.

## Losowe rozgałęzienia

Użyj `CounterSetRandom`, aby losowo wybrać gałąź:

1. Ustaw licznik `branch` na losową wartość od 1 do 3
2. Dodaj trzy osobne wyzwalacze, każdy sprawdzający `Counter: branch = 1`, `= 2`, `= 3`
3. Każda gałąź uruchamia inny dialog lub inny wynik

Dobre do klimatycznych wydarzeń i urozmaicenia losowych spotkań.
