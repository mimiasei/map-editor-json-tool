---
title: Wyzwalacze i warunki
category: concepts
order: 1
---

## Jak działają wyzwalacze

Wyzwalacz znajduje się wewnątrz podzadania. Każdy wyzwalacz nasłuchuje swoich warunków i uruchamia swoje akcje, gdy zostaną spełnione. Wyzwalacz domyślnie uruchamia się **raz**, a potem jest wyłączany. Ustaw `repeat: true` dla wyzwalaczy ciągłych (np. cotygodniowe przydziały zasobów).

> **Note:** Wyzwalacze nie są oceniane w sposób ciągły przy każdym takcie gry. Warunki to **jednorazowe nasłuchiwacze** — każdy warunek uruchamia się w chwili, gdy jego wymaganie zostanie po raz pierwszy spełnione, a potem dezaktywuje się na stałe. Warunek nie włączy się sam ponownie ani nie uruchomi znowu, nawet jeśli wymaganie przestanie być później spełnione.

## Warunki to jednorazowe nasłuchiwacze

To najważniejsza zasada do zapamiętania: **każdy warunek to jednorazowy nasłuchiwacz zdarzenia, a nie ciągłe sprawdzanie stanu.**

Gdy wymaganie warunku zostanie spełnione po raz pierwszy, warunek się uruchamia — i wyłącza. Nie uruchomi się ponownie, chyba że wyzwalacz zostanie oceniony od nowa (np. przez `TriggerClear`).

Na przykład: warunek `Counter` ustawiony na `quest_stage >= 2`, który już się uruchomił, *nie* wykryje, że `quest_stage` później spadnie poniżej 2. Uruchomił się raz; to koniec.

> **Note:** Dotyczy to wszystkich warunków. Planuj logikę wokół momentu zmiany stanu, a nie wokół stanu trwającego.

## Logika AND i OR

Każdy wyzwalacz ma ustawienie `conditionsLogic`: **OR** (musi uruchomić się dowolny jeden warunek) lub **AND** (każdy warunek musi uruchomić się co najmniej raz).

Dla złożonej logiki — np. „(A i B) lub C” — użyj wielu wyzwalaczy z oddzielnymi zestawami warunków.

### Logika AND i problem TriggerClear

Ponieważ warunki to jednorazowe nasłuchiwacze, logika **AND** uruchamia się, gdy każdy warunek uruchomił się choć raz — nawet jeśli nigdy nie wystąpiły jednocześnie. Na przykład, jeśli wyzwalacz wymaga „gracz posiada Miasto A **AND** gracz posiada Miasto B”, każdy warunek własności uruchamia się niezależnie, gdy zostanie po raz pierwszy spełniony. Dopóki oba w końcu się uruchomią (w dowolnej kolejności), wyzwalacz się wykona.

Może to dawać nieoczekiwane wyniki, jeśli warunek się uruchomi, a potem zostanie „unieważniony” (np. gracz od razu straci miasto). Aby zresetować wszystkie warunki wyzwalacza i zacząć od nowa, użyj akcji **`TriggerClear`** lub **`TriggerClearCustom`**, które czyszczą stan uruchomienia warunków we wskazanym wyzwalaczu.

## Warunki są sprawdzane tylko dla właścicieli aktywnego zadania

Warunki są oceniane tylko dla graczy, którzy mają aktywne zadanie je zawierające. To, którzy gracze mają zadanie, określa pole `sharing` zadania. Warunek *może* jednak nadal odwoływać się do bohaterów lub obiektów należących do innych graczy — jeśli w parametrach użyto ich konkretnych SID encji.

## Warunki oparte na zdarzeniach

Te warunki uruchamiają się, gdy zajdzie określone zdarzenie:

- `SquadKill` — neutralny oddział zostaje pokonany
- `HeroKill` — konkretny bohater zostaje pokonany
- `SquadInteraction` — gracz zbliża się do neutralnego oddziału
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — gracz wchodzi w interakcję z obiektem mapy
- `ObjectLose` — gracz traci obiekt, który można zdobyć
- `ObjectCaptureEntity` — gracz zdobywa obiekt
- `NodeRevealed` — mgła wojny zostaje usunięta w węźle
- `PlayerDefeated` — gracz zostaje wyeliminowany

## Warunki oparte na stanie

Te warunki sprawdzają bieżący stan gry w chwili, gdy po raz pierwszy są oceniane:

- `Counter` — sprawdza wartość licznika: `quest_stage >= 2`
- `UnitOwnSide` / `UnitOwnHero` — sprawdza liczbę jednostek w armiach
- `ResCounter` — sprawdza zapas zasobów
- `ItemOwnSide` — sprawdza posiadanie artefaktu
- `DifficultyCustomMap` — sprawdza ustawienie poziomu trudności mapy (indeks 0–4)

## Warunki oparte na czasie

Te warunki uruchamiają się w określonych momentach:

- `StartTurn` — uruchamia się na początku konkretnego tygodnia/dnia dla konkretnego gracza. Parametry: `weekNumber`, `dayNumber`. Do „po X dniach łącznie” użyj zamiast tego dodatkowego pola `counter`.
- `StartWeek` — uruchamia się na początku dowolnego tygodnia (co 7 tur). Brak wymaganych parametrów; obsługuje opcjonalne dodatkowe pole `counter`.
- `AnyStartTurn` — uruchamia się na początku tury dowolnego gracza. Parametry: `month`, `week`, `day` (użyj -1 dla dowolnego).

## Dodatkowe pole counter

Niektóre warunki (`UnitKill`, `UnitLose`, `UnitHire`, `StartTurn`, `StartWeek`) mają dodatkowe pole **Counter**. Ustawia ono próg: warunek uruchamia się dopiero po N spełnieniach.

Na przykład: `UnitKill` z `counter: 10` uruchamia się dopiero po zabiciu 10 jednostek danego typu.

> **Note:** To pole counter jest odrębne od systemu SID liczników — to zwykła liczba, a nie odwołanie do nazwanego licznika.

## Brak warunków

Wyzwalacz bez warunków uruchamia się natychmiast, gdy podzadanie stanie się aktywne. Użyj tego do akcji „na początku zadania”, jak pokazanie dialogu wprowadzającego czy umieszczenie znaczników zadania.

> **Warning:** Wyzwalacz bez warunków połączony z `repeat: true` uruchamia się przy każdym takcie. Prawie nigdy nie jest to to, czego chcesz.
