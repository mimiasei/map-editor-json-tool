---
title: Jak działają zadania
category: getting-started
order: 1
---

## Hierarchia

Plik scenariusza zawiera trzy tablice najwyższego poziomu: `counters`, `quests` i `interruptions`.

Każde **zadanie** ma jedno lub więcej **podzadań**. Każde podzadanie ma jeden lub więcej **wyzwalaczy**. Każdy wyzwalacz ma **warunki** i **akcje**.

Gdy warunki wyzwalacza są spełnione, uruchamiają się jego akcje.

## Zadania

Zadanie to kontener najwyższego poziomu. Pojawia się w dzienniku zadań w grze. Jego pola `name` i `description` to SID-y lokalizacji — muszą mieć odpowiadające tokeny w `customMaps.json` Twojej mapy.

Zadanie jest aktywne od początku gry, chyba że ustawisz `activeOnStart: false`.

> **Note:** Nazwy i opisy zadań są wyświetlane graczowi. Muszą być zlokalizowane — surowy tekst nie pojawi się w dzienniku zadań.

## Flagi zadania: main, hidden, sharing

Trzy opcjonalne flagi zadania zmieniają sposób, w jaki gra je traktuje.

**`main: true`** oznacza zadanie jako główny cel mapy. W dzienniku zadań w grze jest ono wyświetlane jako zadanie główne, a nie poboczne. Według oficjalnych plików scenariuszy ustawia się ją na zadaniach takich jak `main_quest_line` i `city_attack_quest_line_starter` — tych, na których gracz ma się skupić. Zadania poboczne, zadania zachowania SI i zadania śledzące w tle jej nie ustawiają (domyślnie `false`).

**`hidden: true`** całkowicie ukrywa zadanie w dzienniku zadań gracza. Używaj tego dla zadań istniejących wyłącznie na potrzeby wewnętrznej logiki — skryptów ruchu SI, liczników w tle, warunków porażki — które nigdy nie powinny być widoczne dla gracza.

**`sharing`** określa, jak zadanie jest rozdzielane w trybie wieloosobowym. W oficjalnych plikach scenariuszy występują dwie wartości:

- `"Clone"` — każdy gracz dostaje własną, niezależną kopię zadania. Postęp jest śledzony osobno dla każdego gracza. To domyślna wartość dla wszystkich zwykłych zadań — zadań graczy, pobocznych, celów itd.
- `"Ai"` — zadanie jest oceniane tylko dla graczy sterowanych przez SI. Używane w ukrytych zadaniach skryptujących zachowanie bohaterów SI (np. trasy patroli, wzorce ruchu). Gracze-ludzie nigdy nie wchodzą w interakcję z tymi zadaniami.

> **Note:** `sharing` jest wymagane przez silnik gry — zawsze je ustawiaj. Edytor domyślnie ustawia nowe zadania na `"Clone"`, co jest poprawne dla wszystkich zadań widocznych dla gracza.

## Izolacja zadań

Zawartość każdego zadania jest całkowicie odizolowana od wszystkich pozostałych zadań. Oznacza to, że SID-y encji, odwołania do liczników i inne identyfikatory mogą się powtarzać w różnych zadaniach bez konfliktu.

## Podzadania

Podzadania to etapy w obrębie zadania. Proste zadanie może mieć tylko jedno podzadanie. Zadanie wieloetapowe (np. „znajdź trzy relikwie”) ma wiele podzadań aktywowanych po kolei.

Użyj akcji `CurrentSubQuestDone` lub `SubQuestDone`, aby ukończyć podzadanie i przejść do następnego.

## Grupy podzadań — kroki równoległe

Podzadania można łączyć w **grupy podzadań**. Pozwala to grze traktować kilka równoległych kroków jako jedną całość — następny krok odblokowuje się dopiero, gdy wszystkie z nich są ukończone.

**Przykład:** Podzadanie 3 „Pokonaj ostatniego bossa” ma się włączyć dopiero po ukończeniu przez gracza zarówno Podzadania 1 „Znajdź legendarny miecz”, JAK I Podzadania 2 „Znajdź legendarną tarczę”.

Zamiast tworzyć pomocnicze ukryte zadania do śledzenia tego, możesz:

1. Zdefiniować grupę podzadań (np. `subquest_group_relics`)
2. Przypisać do niej Podzadanie 1 i Podzadanie 2
3. Zakończyć oba podzadania akcją `NextAfterGroup` zamiast `NextSubQuest`, podając jako parametry SID grupy i SID docelowego podzadania

Podzadanie 3 stanie się aktywne dopiero, gdy oba podzadania z grupy wywołają `NextAfterGroup`.

> **Note:** Konfiguruje się to akcjami `NextAfterGroup` lub `NextQuestAfterGroup`. SID grupy jest zdefiniowany w sekcji `subQuestGroups` zadania.

## Wyzwalacze

Wyzwalacze to jednostki logiki. Każdy wyzwalacz nasłuchuje swoich warunków i uruchamia akcje, gdy są spełnione.

Wyzwalacz domyślnie uruchamia się **raz**. Ustaw `repeat: true`, aby uruchamiał się za każdym razem, gdy warunki zostaną spełnione.

> **Warning:** Powtarzające się wyzwalacze bez warunków (lub z zawsze prawdziwymi warunkami) uruchamiają się w każdym takcie gry. Zawsze zabezpieczaj powtarzające się wyzwalacze co najmniej jednym sprawdzeniem licznika lub stanu.

## Kolejność wykonywania wyzwalaczy

Jeśli kilka wyzwalaczy w tym samym podzadaniu uruchamia się jednocześnie, ich akcje wykonują się w kolejności deklaracji: najpierw wszystkie akcje pierwszego wyzwalacza, potem wszystkie akcje drugiego itd. Pamiętaj o tym, gdy akcje jednego wyzwalacza wpływają na warunki innego wyzwalacza w tym samym podzadaniu.

## SID-y encji — łączenie wyzwalaczy z obiektami mapy

Wiele warunków i akcji musi odwoływać się do **konkretnego obiektu umieszczonego na mapie** — neutralnego oddziału, miasta, bohatera, zasobu do zebrania, portalu itp. Robi się to przez **SID encji**.

W edytorze map każdy interaktywny obiekt ma w panelu właściwości pole **Encja**. Ustawienie go nadaje konkretnej umieszczonej instancji unikalny identyfikator, odrębny od jej typu. Na przykład oddział Smoków umieszczony przy mieście startowym może dostać SID encji `E_Squad_Dragon`. Portal może mieć `portal_south`.

Ten SID encji wpisujesz w odpowiedni parametr w tym edytorze. Na przykład:

- warunek `SquadKill` — wpisz SID encji umieszczonego neutralnego oddziału
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — wpisz SID encji obiektu mapy, na który wchodzi gracz
- akcja `DeleteEntity` — wpisz SID encji obiektu do usunięcia
- akcja `SetQuestMarker` — wpisz SID encji obiektu do oznaczenia

> **Note:** SID encji to nie to samo co SID typu. `E_Squad_Dragon` to *umieszczona instancja* oddziału; `Dragon` to typ jednostki. Zawsze używaj SID-u encji (z pola Encja w edytorze map), gdy warunek lub akcja prosi o odwołanie do obiektu.

## Warunki

Warunki łączy się logiką AND lub OR (ustawianą dla każdego wyzwalacza). Jeśli nie ma żadnych warunków, wyzwalacz uruchamia się natychmiast, gdy podzadanie jest aktywne.

Pełny opis znajdziesz w [Wyzwalacze i warunki](guide:triggers-and-conditions).

## Akcje

Akcje wykonują się po kolei, gdy spełnione są wszystkie warunki. Typowe akcje: pokazanie dialogu, ukończenie podzadania, przejście do następnego zadania, danie graczowi zasobów lub przedmiotów albo uruchomienie zwycięstwa/porażki.

## Liczniki

Liczniki to zmienne całkowitoliczbowe, które istnieją przez cały czas życia mapy. Deklaruje się je na karcie Liczniki i odwołuje się do nich przez SID.

Używaj ich do śledzenia etapów zadań, liczby pokonanych wrogów, progów zasobów i nie tylko. Zobacz [Liczniki i śledzenie](guide:counters-and-tracking).

## Przerwania

Przerwania to haki cyklu życia walki — uruchamiają się, gdy zajdą określone zdarzenia bitwy bohaterów, np. przed walką gracza z wrogim bohaterem albo po wygranej bitwie bohater przeciw bohaterowi. Nie mają warunków do skonfigurowania; o momencie uruchomienia decyduje sam typ zdarzenia.

Używaj ich do dialogów przed bitwą, nagród po bitwie i sekwencji walk z bossami. Można je włączać i wyłączać w trakcie gry akcjami `EnableInterruption` i `DisableInterruption`.

Pełny opis znajdziesz w [Przerwania](guide:interruptions).
