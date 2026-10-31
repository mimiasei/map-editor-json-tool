---
title: Testowanie mapy
category: troubleshooting
order: 1
---

## Edytor map nie odzwierciedla zmian w JSON

To najważniejsza rzecz do zrozumienia: **zmiany wprowadzane w tym edytorze — logika zadań, liczniki, wyzwalacze — są niewidoczne w edytorze map HoMM:OE.** Edytor map pokazuje wyłącznie warstwę wizualną (teren, obiekty, bohaterów na mapie).

Twoje zmiany w JSON odczytuje **silnik gry w trakcie działania**, a nie edytor map.

> **Warning:** Nie otwieraj zapisanego pliku mapy w edytorze map HoMM:OE w oczekiwaniu, że zobaczysz logikę zadań. Zobaczysz tylko warstwę wizualną. Gra poprawnie odczytuje JSON w trakcie działania.

## Przebieg testowania

Prawidłowy sposób testowania logiki zadań:

1. Wprowadź zmiany w tym edytorze
2. Użyj **Save As** (lub Export), aby uzyskać zaktualizowany plik JSON
3. Podmień JSON scenariusza w pliku mapy (albo umieść go tam, gdzie gra go oczekuje)
4. Wczytaj mapę w HoMM:OE
5. Przetestuj odpowiedni scenariusz w grze
6. Powtarzaj

## Gdzie jest JSON scenariusza w mapie

Plik mapy `.homm` to archiwum ZIP. Rozpakuj go i znajdź `scenario.json` (lub plik o podobnej nazwie) w katalogu głównym albo w folderze `DB/`. Zastąp go zaktualizowanym JSON-em, a następnie spakuj archiwum ponownie.

> **Note:** Zachowaj kopię zapasową oryginalnej mapy przed podmianą plików.

## Najpierw walidacja

Przed testem w grze kliknij **Validate** na pasku narzędzi. Walidator wychwytuje:

- Brakujące tokeny lokalizacji
- Odwołania do liczników, które nie pasują do zadeklarowanych liczników
- Odwołania SID do zadań/podzadań, które nie istnieją
- Puste wymagane parametry

Napraw wszystkie błędy przed testem w grze. Ostrzeżenia mają charakter informacyjny — gra może mimo to działać poprawnie.

## Wskazówki do szybkiej iteracji

- Użyj `CounterSet`, aby przyspieszyć stan zadania w wyzwalaczu testowym (np. ustaw `quest_stage` na 5 w turze 1, by przetestować logikę końcowej fazy gry)
- Użyj `SpawnHero`, aby umieścić konkretnego bohatera do testowania warunków, które wymagają jego istnienia
- Użyj `RevealFogOfWar` na początku mapy z dużym promieniem, aby widzieć wszystko podczas testów
