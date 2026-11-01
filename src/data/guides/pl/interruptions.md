---
title: Przerwania
category: concepts
order: 3
---

## Czym są przerwania

Przerwania to trzecia tablica najwyższego poziomu w pliku scenariusza, obok `counters` i `quests`. Są to **haki cyklu życia walki** — uruchamiają się, gdy zajdą określone zdarzenia bitewne bohaterów, a nie gdy spełnione zostaną warunki.

Przerwanie ma:
- `sid` — unikalny identyfikator używany przez `EnableInterruption` / `DisableInterruption`
- `interruption` — typ zdarzenia, które je uruchamia (patrz niżej)
- `activeOnStart` — czy jest aktywne po wczytaniu mapy
- `p` — parametry (zwykle SID encji bohatera, który zawęża hak)
- `actions` — co się wykonuje, gdy zdarzenie zajdzie (te same typy akcji co w wyzwalaczach zadań)

## Przerwania uruchamiają się bez ograniczeń

W przeciwieństwie do wyzwalaczy zadań (które domyślnie uruchamiają się raz) **przerwanie uruchamia się za każdym razem, gdy zajdzie jego zdarzenie, bez limitu, dopóki nie zostanie jawnie wyłączone** przez `DisableInterruption`. Jeśli chcesz, aby uruchomiło się tylko raz, wyłącz je z własnej listy akcji.

## Typy przerwań

| Typ | Uruchamia się, gdy |
|----------------------|---------------------------------------------------------------|
| `BeforeIamVsHero` | Przed bitwą — bohater gracza ma walczyć z wrogim bohaterem |
| `AfterIamWinVsHero` | Po tym, jak bohater gracza wygra z wrogim bohaterem |
| `BeforeHeroVsHero` | Przed dowolną bitwą bohatera z bohaterem (bez względu na to, kim jest gracz) |
| `AfterHeroWinVsHero` | Po tym, jak dowolny bohater wygra bitwę bohatera z bohaterem |

Tablica `p` zawęża hak do konkretnych bohaterów. Na przykład ustawienie `p` na `['E_Hero_Xarfax']` w przerwaniu `BeforeIamVsHero` sprawia, że uruchomi się ono tylko wtedy, gdy bohater gracza ma walczyć z Xarfaxem — a nie z każdym wrogim bohaterem.

> **Note:** W przeciwieństwie do wyzwalaczy zadań przerwania nie mają warunków do skonfigurowania. Warunkiem jest typ `interruption`. O tym, kiedy się uruchomi, decyduje silnik gry.

## Czym przerwania różnią się od wyzwalaczy zadań

Wyzwalacze zadań sprawdzają warunki i uruchamiają się, gdy te zostaną spełnione. Przerwania są inne: gra wywołuje je w określonych momentach cyklu życia bitwy, przed rozstrzygnięciem walki lub po nim.

Co najważniejsze, **przerwania są jedynym sposobem na wstrzymanie standardowej logiki gry** — na przykład pominięcie automatycznego rozpoczęcia walki, gdy bohater wejdzie na wroga. Wyzwalacz zadania uruchamiany w tym samym momencie tego nie potrafi; jego akcje się wykonują, ale nie przerywają sekwencji walki. Przerwanie `BeforeIamVsHero` może pokazać dialog, zanim w ogóle załaduje się ekran bitwy.

Dlatego przerwania są niezbędne do:
- **Pokojowych spotkań** — zapobiegania rozpoczęciu walki i pokazania zamiast niej dialogu
- **Klimatu przed bitwą** — drwiny złoczyńcy przed walką
- **Nagród po bitwie** — przyznawania przedmiotów lub posuwania zadań naprzód po konkretnej walce

## Typowe zastosowania

**Dialog przed bitwą (drwiny złoczyńcy)**

Pokaż dialog, zanim gracz zawalczy z kluczowym wrogim bohaterem:

1. Dodaj przerwanie typu `BeforeIamVsHero`
2. Ustaw `p` na SID encji wrogiego bohatera
3. Ustaw `activeOnStart: true`
4. Dodaj akcję `Dialog`

Dialog uruchamia się w chwili, gdy gracz kliknie, by zaatakować tego bohatera, zanim załaduje się ekran bitwy.

**Nagroda po bitwie i postęp zadania**

Gdy gracz pokona bohatera-bossa, posuń zadanie naprzód i daj nagrodę:

1. Dodaj przerwanie typu `AfterIamWinVsHero`
2. Ustaw `p` na SID encji bohatera-bossa
3. Dodaj akcje: `Dialog` (przemowa zwycięzcy), `GiveRes` (nagroda), `CurrentSubQuestDone` lub `CounterSet`

> **Warning:** `AfterIamWinVsHero` uruchamia się, gdy gracz wygra. Jeśli gracz przegra bitwę, nie uruchomi się. Nie polegaj na nim w logice „bitwa się odbyła” — tylko w logice „gracz wygrał”.

**Starcie z bossem (przed + po)**

Aby uzyskać pełne wrażenia z walki z bossem, połącz dwa przerwania na tym samym SID bohatera:

- `BeforeIamVsHero` → dialog z drwinami
- `AfterIamWinVsHero` → nagroda + postęp zadania

**Uruchomienie tylko raz**

Jeśli przerwanie ma zadziałać tylko przy pierwszym spotkaniu z bohaterem:

1. Ustaw `activeOnStart: true`
2. Jako ostatnią akcję przerwania dodaj `DisableInterruption` z SID tego samego przerwania

**Warunkowa aktywacja**

Jeśli przerwanie ma być aktywne tylko na pewnym etapie zadania, ustaw `activeOnStart: false` i włącz je z wyzwalacza zadania:

1. W wyzwalaczu zadania dodaj `EnableInterruption` z SID przerwania
2. Po rozstrzygnięciu walki (lub przy zmianie etapu zadania) dodaj `DisableInterruption`, aby posprzątać

Dzięki temu przerwanie nie uruchomi się przed zamierzonym oknem ani po nim.

## Parametry (p)

Znaczenie tablicy `p` zależy od typu. Dla czterech znanych typów `p[0]` to **SID encji bohatera** — konkretny bohater, do którego zawężone jest przerwanie. Jeśli `p` jest puste, przerwanie uruchamia się dla dowolnego bohatera pasującego do typu.

> **Note:** SID encji bohaterów ustawia się w edytorze map podczas umieszczania bohatera na mapie. Wyglądają jak `E_Hero_Xarfax` lub `E_Hero_SomeVillain`. Sprawdź je w panelu właściwości edytora map dla umieszczonego obiektu bohatera.

## Włączanie i wyłączanie w trakcie gry

Użyj akcji `EnableInterruption` i `DisableInterruption` (dostępnych w każdym wyzwalaczu zadania lub na liście akcji innego przerwania), aby włączać i wyłączać przerwania:

- `EnableInterruption` — aktywuje przerwanie, tak że uruchomi się przy następnym pasującym zdarzeniu
- `DisableInterruption` — dezaktywuje je, tak że nie uruchomi się ponownie, dopóki nie zostanie włączone

Obie akcje przyjmują jako parametr `sid` przerwania.
