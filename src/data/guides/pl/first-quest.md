---
title: Tworzenie pierwszego zadania
category: getting-started
order: 2
---

## Co zbudujemy

Proste zadanie: gracz musi pokonać konkretny oddział neutralny. Gdy to zrobi, otrzymuje złoto, a zadanie zostaje ukończone.

Możesz użyć szablonu **Simple Kill Quest** (Plik → Nowy z szablonu), aby wczytać gotową wersję tego wzorca.

## Krok 1: Dodaj licznik

Otwórz kartę **Liczniki** i dodaj nowy licznik. Nadaj mu opisowy SID, np. `quest_target_killed`. Ustaw wartość początkową na `0`.

> **Note:** Edytor map nie pokazuje liczników — istnieją tylko w JSON-ie. Gra odczytuje je i śledzi poprawnie w trakcie działania.

## Krok 2: Utwórz zadanie

Na karcie **Zadania** kliknij **Dodaj zadanie**. Ustaw:
- `sid` — unikalny identyfikator, np. `kill_quest`
- `name` — SID lokalizacji tytułu zadania, np. `kill_quest_name`
- `description` — SID lokalizacji opisu, np. `kill_quest_desc`

Dodaj tokeny lokalizacji w oknie **Lokalizacja** (pasek narzędzi → przycisk Lokalizacja).

## Krok 3: Dodaj podzadanie

Wewnątrz zadania dodaj **Podzadanie**. Reprezentuje ono etap „pokonaj cel”. Nadaj mu SID, np. `kill_quest_1`.

## Krok 4: Dodaj wyzwalacz

Wewnątrz podzadania dodaj **Wyzwalacz**. Ten wyzwalacz nasłuchuje pokonania celu i uruchamia akcje zakończenia.

## Krok 5: Dodaj warunek SquadKill

W **Warunkach** wyzwalacza dodaj warunek **Squad Defeated**. Ustaw ID oddziału na SID encji, który przypisałeś neutralnemu oddziałowi w edytorze map (np. `E_Squad_Dragon`).

> **Note:** SID encji oddziału ustawia się w edytorze map podczas umieszczania neutralnego oddziału — to nie jest nazwa typu jednostki.

## Krok 6: Dodaj akcje zakończenia

W **Akcjach** wyzwalacza dodaj:
1. `CounterSet` — ustaw `quest_target_killed` na `1`
2. `GiveRes` — daj graczowi `500` złota w nagrodę
3. `CurrentSubQuestDone` — ukończ bieżące podzadanie
4. `Dialog` — pokaż dialog zakończenia (opcjonalnie, ale zalecane)

## Krok 7: Dodaj lokalizację

Otwórz okno **Lokalizacja** i dodaj tokeny:
- `kill_quest_name` → `'Hunt the Dragon'`
- `kill_quest_desc` → `'A dragon has been terrorizing the region. Defeat it.'`

Te tokeny trafiają do pliku `customMaps.json` Twojej mapy przy eksporcie ZIP-a.

## Krok 8: Przetestuj

Wyeksportuj JSON projektu (Zapisz jako), umieść go przy swojej mapie i wczytaj mapę w grze. Prawidłowy przebieg opisuje [Testowanie mapy](guide:testing-your-map).

> **Warning:** Edytor map NIE pokazuje zmian zadań ani liczników wizualnie. Musisz wczytać mapę w grze, aby sprawdzić, czy logika działa.
