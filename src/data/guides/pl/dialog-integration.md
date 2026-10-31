---
title: Integracja dialogów
category: recipes
order: 1
---

## Przegląd

Dialogi w HoMM:OE są zdefiniowane jako osobne pliki JSON w `DB/dialogs/dialogs/`. Każdy dialog ma unikalne ID i zawiera jeden lub więcej slajdów (tekst + dane mówcy).

Akcja `Dialog` odtwarza dialog o podanym ID. Akcja `RandomDialog` odtwarza losowo jeden z kilku dialogów.

## Tworzenie dialogu

Użyj **Edytora dialogów** (dostępnego z panelu Dialogi lub przez skrót „Edytuj dialog →” w akcji Dialog). Każdy slajd dialogu ma SID tekstu lokalizacji, opcjonalnego mówcę i opcjonalne dane portretu.

Wszystkie SID-y tekstów slajdów trzeba dodać do lokalizacji mapy w oknie **Lokalizacja**.

## Użycie akcji Dialog

Dodaj akcję `Dialog` do dowolnego wyzwalacza. Ustaw **Klucz dialogu** na dokładny SID utworzonego dialogu.

Dialog uruchamia się, gdy spełnione są warunki wyzwalacza.

> **Note:** Dialog i wszystkie jego tokeny lokalizacji muszą być zawarte w pliku ZIP mapy. Użyj **Eksportuj ZIP**, aby spakować wszystko razem.

## Dialogi interakcji z obiektem

Częsty wzorzec to pokazanie dialogu, gdy gracz wejdzie w interakcję z obiektem na mapie:

1. Dodaj wyzwalacz w podzadaniu
2. Dodaj warunek `ObjectInteractionBefore` — ustaw SID encji na swój obiekt mapy
3. Dodaj akcję `Dialog`

Dialog uruchamia się przed domyślną interakcją z obiektem (zebranie skarbu, walka itp.).

## Dołączanie dialogów do ZIP-a mapy

Gra odczytuje dialogi z folderu `DB/dialogs/` w ZIP-ie mapy. Edytor zarządza tym za Ciebie: przy użyciu **Eksportuj ZIP** wszystkie dialogi dodane w Edytorze dialogów są dołączane automatycznie.

Nie umieszczaj plików dialogów w ZIP-ie ręcznie — edytor zadba o strukturę.

> **Warning:** Jeśli odwołasz się do ID dialogu, którego nie ma w ZIP-ie, gra po cichu go pominie, bez żadnego błędu. Zawsze testuj wyzwalacze dialogów w grze.
