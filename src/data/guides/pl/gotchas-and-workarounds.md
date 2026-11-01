---
title: Pułapki i obejścia
category: troubleshooting
order: 2
---

## Plik zadań jest obowiązkowy — nawet dla wyzwalaczy interakcji

Aby jakakolwiek logika skryptowa działała na mapie, plik zadań `map_name.json` musi istnieć w tym samym folderze co `map_name.map` i zawierać co najmniej pusty blok `"quests"`. Bez niego nawet najprostsze wyzwalacze interakcji podpięte do obiektów przez „Akcje przed/po” w edytorze map całkowicie zepsują wczytywanie mapy.

**Zadania działają z pliku `.map`, nie z `.json`.** Gra odczytuje zadania z Bloku 4 wewnątrz `.map` (oznaczonego bajtem nagłówka po ciągu wersji, `0d 00` zamiast `05 00`) i podczas gry ignoruje towarzyszący plik `.json`. To narzędzie osadza zadania w `.map` przy Zapisie i przy Publikacji; ręcznie edytowany `.json` nic nie zmieni, dopóki mapa nie zostanie zapisana ponownie. Dwie kolejne rzeczy, przez które mapa po cichu pomija swoje zadania lub znika z listy: dwa pliki `.map` z tym samym hashem nagłówka (skopiowana mapa potrzebuje nowego hasha) oraz pliki `.zip` w StreamingAssets, których ID dialogów lub tokeny tekstów powtarzają te z Core.zip albo innego zipa (nadpisują się nawzajem, więc zadbaj o ich unikalność w obrębie mapy).

> **Warning:** Zawsze utwórz i wyeksportuj plik zadań przed testowaniem skryptów w grze, nawet jeśli zawiera tylko pustą tablicę zadań.

## Jedna błędna akcja psuje cały wyzwalacz

Jeśli jakakolwiek akcja w wyzwalaczu jest zapisana niepoprawnie — zła nazwa typu, zła liczba parametrów, nieprawidłowy SID — ta akcja się nie uruchomi. **Nie uruchomi się też żadna inna akcja w tym samym wyzwalaczu.** Cała lista akcji po cichu zawodzi.

> **Warning:** Jeśli wyzwalacz wydaje się nic nie robić, sprawdź każdą akcję pod kątem literówek w nazwie typu i niezgodnej liczby parametrów. Najpierw przetestuj prostą akcję `Print`, aby potwierdzić, że wyzwalacz się uruchamia.

## Akcje wykonują się natychmiast — nie po kolei w czasie rzeczywistym

Wszystkie akcje uruchamiają się jedna po drugiej, nie czekając na zakończenie poprzedniej (z wyjątkiem dialogów, które wstrzymują wykonanie). Oznacza to, że połączenie dwóch akcji powodujących widoczny ruch lub animację może dać nieoczekiwane efekty — widoczny będzie tylko wynik ostatniej.

Na przykład dwie akcje `MoveCamera` pod rząd sprawią, że kamera natychmiast przeskoczy ku drugiemu celowi, bo pierwszy ruch zostanie od razu zastąpiony.

> **Note:** Jeśli potrzebujesz sekwencji akcji w czasie (animacja, pauza, kolejna animacja), użyj akcji dialogowych jako przerw między nimi albo zaprojektuj wyzwalacz jako kilka kroków podzadań.

## Flaga break w akcjach

Każda akcja może mieć opcjonalne pole `"break": true`. Gdy wykona się akcja z `break: true`, wszystkie pozostałe akcje wyzwalacza są pomijane. Używaj tego do warunkowego rozgałęziania — połącz z akcjami dialogowymi (`DialogIfHero`, `DialogIfRes`, `DialogIfCounter`), które uruchamiają się tylko dla określonych graczy lub stanów, a następnie ustaw `break: true` na tych akcjach, aby zatrzymać wykonanie dla tego gracza, zanim ruszą wspólne akcje.

Przykład: pokaż specjalny dialog dla Bohatera A (z `break: true`), a akcje poniżej wykonają się tylko dla pozostałych bohaterów.

## Logika AND uruchamia się, gdy „oba zaszły raz” — nie „oba są prawdziwe jednocześnie”

Ponieważ warunki są jednorazowymi nasłuchiwaczami, `conditionsLogic: "And"` uruchamia się, gdy każdy z warunków zaszedł choć raz — nawet jeśli nigdy nie zaszły równocześnie. Jeśli warunek zaszedł, a potem został „cofnięty” (np. gracz zdobył budynek, a potem go stracił), wyzwalacz i tak się uruchomi, gdy zajdzie drugi warunek, bo pierwszy już się spełnił.

Aby zresetować warunki i zacząć od nowa, użyj `TriggerClear` (resetuje bieżący wyzwalacz) lub `TriggerClearCustom` (resetuje wskazany wyzwalacz po indeksie w innym podzadaniu).

## Wyzwalacze uruchamiają się w kolejności deklaracji

W obrębie podzadania wyzwalacze są oceniane w kolejności deklaracji. Jeśli dwa wyzwalacze uruchamiają się w tym samym takcie, pierwszy zadziała jako pierwszy. Pamiętaj o tym, gdy akcja jednego wyzwalacza włącza warunek innego.

> **Note:** Akcje w obrębie wyzwalacza również wykonują się po kolei. `CounterSet` w akcji 1 jest widoczny dla sprawdzenia warunku `Counter` w następnym wyzwalaczu w tym samym takcie.

## Powtarzające się wyzwalacze i nieskończone pętle

Wyzwalacz z `repeat: true` i bez warunków (lub z zawsze prawdziwymi warunkami) uruchamia się w każdym takcie. To niemal na pewno błąd.

**Zawsze zabezpieczaj powtarzające się wyzwalacze** co najmniej jednym warunkiem, który staje się fałszywy po żądanej liczbie uruchomień — zwykle sprawdzeniem licznika.

> **Warning:** Wyzwalacz uruchamiający się w nieskończoność może uniemożliwić grę na mapie. Stosuj zabezpieczenia licznikami we wszystkich powtarzających się wyzwalaczach.

## SquadKill reaguje na SID encji oddziału, nie na typ jednostki

Gdy umieszczasz neutralny oddział w edytorze map, przypisujesz mu SID encji (np. `goblin_patrol_1`). Warunek `SquadKill` przyjmuje **ten SID encji**, a nie SID typu jednostki (np. `goblin`).

Jeśli chcesz śledzić pokonanie wszystkich goblinów, użyj zamiast tego `UnitKill` z SID-em typu jednostki.

> **Note:** SID-y encji ustawia się w panelu właściwości edytora map dla każdego umieszczonego obiektu lub oddziału.

## Akcje Dialog po cichu zawodzą, gdy brakuje dialogu

Jeśli akcja `Dialog` odwołuje się do ID dialogu, którego nie ma w ZIP-ie mapy, gra pomija ją po cichu — bez błędu i komunikatu. Pozostałe akcje wyzwalacza nadal się uruchamiają.

Zawsze sprawdź, czy każde wskazane ID dialogu istnieje w wyeksportowanym ZIP-ie.

> **Warning:** Przetestuj wszystkie akcje Dialog w grze, zanim opublikujesz mapę.

## Tokeny lokalizacji muszą być w customMaps.json

Nazwy zadań, opisy, teksty dialogów i wszelkie inne napisy widoczne dla gracza muszą mieć wpisy w `customMaps.json` wewnątrz ZIP-a mapy.

Ten edytor zarządza tokenami lokalizacji za Ciebie. Użyj przycisku **Lokalizacja** na pasku narzędzi, aby dodawać i edytować tokeny. Są one dołączane automatycznie przy **Eksportuj ZIP**.

> **Note:** Jeśli SID lokalizacji nie ma w customMaps.json, gra pokaże graczowi surowy SID (np. 'kill_quest_name' zamiast 'Hunt the Dragon').

## SubQuestActivate a NextSubQuest

Obie akcje przesuwają zadanie do przodu, ale działają inaczej:

- `NextSubQuest` aktywuje następne podzadanie w kolejności (po indeksie lub SID) — do liniowego postępu
- `SubQuestActivate` aktywuje dowolne wskazane podzadanie w dowolnym zadaniu — do rozgałęzień lub interakcji między zadaniami

## DeleteHero wywołuje HeroKill

`DeleteHero` usuwa bohatera z mapy i — tak jak porażka, odwrót czy poddanie się w walce — wywołuje warunek `HeroKill`. `DeleteHero` to poprawny sposób na zasymulowanie śmierci bohatera w logice zadań zależnej od `HeroKill`.

## RemoveRes nie sprawdza dostępności

`RemoveRes` odbiera zasoby z zapasów gracza. Jeśli gracz nie ma ich dość, zasób jest ustawiany na 0 — akcja nie kończy się niepowodzeniem ani błędem. Jeśli liczą się dokładne ilości, zawsze najpierw sprawdź poziom zasobów warunkiem `ResCounter`.
