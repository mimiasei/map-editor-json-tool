---
title: Wyzwalacze interakcji i strefy wyzwalaczy
category: concepts
order: 4
---

## Czym są wyzwalacze interakcji

Wyzwalacze interakcji to krótkie, proste sekwencje akcji przypisane bezpośrednio do obiektu mapy w edytorze map Unfrozen. Uruchamiają się, gdy bohater gracza wejdzie w interakcję z tym obiektem — albo **zanim** zadziała własny efekt obiektu (Actions Before), albo **po** nim (Actions After).

> **Note:** Wyzwalacze interakcji konfiguruje się w panelu właściwości obiektu w edytorze map Unfrozen, a nie w tym narzędziu. Ten poradnik wyjaśnia, jak działają, abyś rozumiał pełny obraz skryptów i wiedział, kiedy ich użyć, a kiedy sięgnąć po wyzwalacze z pliku zadań.

## Czym różnią się od wyzwalaczy zadań

Kluczowa różnica: **wyzwalacze interakcji całkowicie przerywają standardową logikę gry.** Wyzwalacz zadania wykonuje swoje akcje, ale nie może wstrzymać ani opóźnić tego, co gra normalnie zrobiłaby w tym momencie. Wyzwalacz interakcji może.

Na przykład:
- Wyzwalacz zadania uruchamiany, gdy gracz wejdzie w interakcję z oddziałem, nie może zapobiec rozpoczęciu walki — dialog otwiera się i od razu zamyka, gdy zaczyna się bitwa.
- Wyzwalacz Actions Before na tym samym oddziale *może* pokazać dialog, zanim załaduje się ekran bitwy. Animacja śmierci po walce odtwarza się również dopiero *po* zakończeniu dialogu Actions After.

Dlatego wyzwalacze interakcji są właściwym narzędziem do:
- dialogów, które muszą odegrać się przed rozstrzygnięciem walki lub podniesieniem przedmiotu
- sekwencji w stylu scenek przerywnikowych przy interakcji z konkretnymi obiektami
- każdej sytuacji, w której trzeba wstrzymać zwykły przebieg gry

Dla dialogów przy starciach bohatera z bohaterem użyj zamiast tego [Przerwań](guide:interruptions) — wyzwalaczy interakcji nie można przypisać do bohaterów.

## Actions Before i Actions After

| Właściwość | Kiedy się uruchamia |
|---|---|
| Actions Before | Zanim zadziała własny efekt obiektu (przed rozpoczęciem walki, przed zebraniem zasobu itp.) |
| Actions After | Po rozstrzygnięciu efektu obiektu (po zakończeniu walki, po podniesieniu itp.) |

Obie można przypisać do tego samego obiektu jednocześnie. O kolejności wykonania decyduje kolejność dodania akcji w danej właściwości.

> **Warning:** Jeśli dla akcji ustawiono mniej lub więcej parametrów, niż przyjmuje, akcja się nie uruchomi. Obowiązuje ta sama zasada co dla akcji w pliku zadań.

## Pole wyboru Repeat

Każda właściwość Actions Before / Actions After ma pole wyboru **Repeat**. Gdy jest włączone, akcje uruchamiają się za każdym razem, gdy bohater wejdzie w interakcję z obiektem. Gdy jest wyłączone (domyślnie), akcje uruchamiają się tylko raz — za pierwszym razem.

## Identyfikatory stron wejściowych (input sides IDs)

Pole **input sides IDs** wyzwalacza interakcji ogranicza, którzy gracze uruchamiają akcje. Wpisz indeksy graczy (liczone od 0), aby ograniczyć wyzwalacz. Na przykład wpisanie `1` oznacza, że akcje uruchomią się tylko wtedy, gdy z obiektem wejdzie w interakcję bohater gracza 2.

Jeśli pole jest puste, akcje uruchamiają się dla dowolnego gracza.

## Strefy wyzwalaczy

**Strefa wyzwalacza** to specjalny rodzaj niewidocznego obiektu, który umieszcza się na mapie z głównego panelu narzędzi edytora. Zamiast być przypisaną do konkretnego obiektu, jej akcje uruchamiają się, gdy dowolny bohater wejdzie na jedno z jej pól.

Kluczowe zachowania z oficjalnego poradnika:

- **Ruch zostaje przerwany**, gdy bohater wejdzie do strefy wyzwalacza, niezależnie od tego, co robi dołączona akcja i czy ma jakikolwiek widoczny efekt. Nawet pojedyncza akcja `Print` (wypisanie do konsoli deweloperskiej) zatrzyma bohatera w połowie drogi.
- **Latający bohaterowie** nie aktywują akcji strefy wyzwalacza, jeśli przelecą nad nią i wylądują poza jej obszarem. Aktywują ją, jeśli wylądują wewnątrz.
- **Pole wyboru Repeat** w strefie wyzwalacza działa tak samo jak w wyzwalaczach obiektów. Bez niego strefa uruchamia się tylko przy pierwszym wejściu. Z nim strefa uruchamia się za każdym razem, gdy bohater wejdzie z zewnątrz — ale nie wtedy, gdy porusza się wewnątrz strefy.
- **Dezaktywacja strefy** akcją `SetActiveMarker` (lub odznaczenie „Activate” w edytorze) całkowicie uniemożliwia jej przerywanie ruchu bohatera.

> **Note:** `SetActiveMarker` jest dostępna w edytorze akcji w tym narzędziu. Użyj jej z wyzwalacza zadania, aby dynamicznie włączać i wyłączać strefy wyzwalaczy w trakcie gry.

## Czym zajmuje się ten edytor

Ten edytor zarządza **plikiem zadań** (`map_name.json`) — sekcjami `counters`, `interruptions` i `quests`. Wyzwalacze interakcji i strefy wyzwalaczy są przypisywane do obiektów w **edytorze map Unfrozen** i nie należą do pliku zadań.

Możesz jednak używać akcji dostępnych w tym edytorze, aby oddziaływać na strefy w trakcie gry:
- `SetActiveMarker` — włącza lub wyłącza strefę wyzwalacza według SID jej encji

Podejście z plikiem zadań do wstrzymywania logiki gry przy spotkaniach bohaterów znajdziesz w [Przerwaniach](guide:interruptions).
