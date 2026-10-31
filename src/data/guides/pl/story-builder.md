---
title: Kreator opowieści
category: recipes
order: 3
---

## Co robi

Przycisk **Story** na pasku narzędzi dodaje do mapy kompletną, spójną opowieść: łańcuch zadań, dialogi, które ją opowiadają, i liczniki zapamiętujące wybory gracza. Wskazujesz miejsca na mapie i wybierasz ton; tekst zostaje napisany za ciebie. Wszystko, co powstaje, to zwykłe zadania, liczniki i dialogi, więc możesz je potem otworzyć i zmienić jak coś napisanego samodzielnie.

Jedno cofnięcie usuwa zadania i liczniki opowieści. Dialogi i ich teksty zostają w projekcie, więc usuń je z listy Dialogów, jeśli ich nie chcesz.

> **Note:** Najpierw otwórz swój plik `.map`, aby opowieść mogła zaproponować miasta, armie i obiekty z twojej mapy. Nadaj mapie nazwę w Ustawieniach mapy, ponieważ każdy identyfikator tworzony przez opowieść zaczyna się od niej.

## Wybór opowieści

Wybierz jedną z gotowych opowieści, **Build my own** albo **I have my own idea**.

- **Gotowe opowieści** mają co najmniej jeden prawdziwy wybór dla gracza: *The Cursed Moor* (podążanie tropami, potem oskarżenie kogoś), *The Long Siege* (przygotowania, potem przetrwanie określonej liczby dni) oraz *The Border Oath* (zdobycie miasta, wybór sposobu traktowania jego mieszkańców, potem starcie z wodzem wojennym).
- **Build my own** pozwala układać kroki: wprowadzenie, odwiedzanie miejsc, zdobycie miasta, pokonanie armii, zebranie złota, przeczekanie określonej liczby dni, nagrodę i wybory gracza. Zakończenie jest dodawane za ciebie i reaguje na wybory.
- **I have my own idea** zamienia kilka twoich zdań, w dowolnym języku, w opowieść tego samego rodzaju. Wymaga pisarza tekstu (patrz niżej).

## Wskazywanie miejsc na mapie

Każda opowieść prosi o kilka rzeczy z twojej mapy, takich jak miasto do zdobycia czy miejsca do odwiedzenia. Kreator podpowiada propozycje, które możesz po prostu zaakceptować. Aby którąś zmienić, wyszukaj ją po nazwie albo użyj przycisku pinezki, by kliknąć ją na Siatce mapy.

> **Note:** Wybrać można tylko obiekty, miasta i armie, które mają na mapie nazwę (identyfikator encji). Nadaj im nazwy najpierw w edytorze map gry.

## Wybory gracza

Wybór to dialog z dwiema do czterech odpowiedzi. Każda odpowiedź może zmieniać licznik, dawać lub zabierać złoto i pokazuje własny tekst ciągu dalszego. Niektóre odpowiedzi są dostępne tylko wtedy, gdy gracz ma dość złota.

Późniejsze kroki odczytują, co wybrano. Zakończenie może na przykład różnić się zależnie od tego, ile miłosiernych lub okrutnych odpowiedzi udzielił gracz. To wzorzec „rozgałęzić, śledzić, wypłacić”: wybór ustawia licznik, a coś później go sprawdza.

Liczby stojące za opowieścią to zwykłe liczniki (patrz *Counters & Tracking*). Kreator pokazuje je pod nazwami, takimi jak „Mercy” czy „Clues found”, podczas gdy same liczniki dostają identyfikatory zaczynające się od nazwy twojej mapy i opowieści.

## Tekst

Każdą linię tekstu można edytować w podglądzie, zanim cokolwiek zostanie dodane. **Another** daje inną wersję jednej linii, a **Rewrite all** przepisuje całą opowieść. Edytuj swobodnie: tekst trafia do tokenów lokalizacji, więc możesz go później zmienić także w edytorze Lokalizacji.

Bez żadnej konfiguracji tekst pochodzi z wbudowanych sformułowań w czterech tonach (heroiczny, ponury, humorystyczny, tajemniczy). Dobrze się to sprawdza przy wypróbowywaniu opowieści. Odpowiedzi są ogólne dla danego rodzaju (śmiała, ostrożna, miłosierna itd.).

## Pisarz tekstu (opcjonalny, aplikacja desktopowa)

Dzięki darmowemu kluczowi Google Gemini lub Groq tekst jest pisany tak, by pasował do twojej opowieści i nazw z mapy, możesz pisać w dowolnym z 16 języków gry, a **I have my own idea** staje się dostępne.

Skonfiguruj to na pierwszym ekranie Kreatora opowieści: wybierz usługę, wklej swój klucz i zaakceptuj informację. Klucz jest przechowywany w magazynie poświadczeń twojego systemu operacyjnego, a nie w projekcie.

- Wygenerowany tekst i każdy wpisany pomysł na opowieść są wysyłane do wybranej usługi. Darmowe plany mogą wykorzystywać je do ulepszania swoich modeli, więc nie umieszczaj tam niczego prywatnego.
- Jeśli usługa jest nieosiągalna, klucz zostanie odrzucony lub wyczerpie się darmowy limit, używany jest tekst wbudowany, a opowieść nadal działa.
- Wybierz język w polu **Write in** na pierwszym ekranie. Angielski jest zawsze tworzony także, aby gra mogła do niego wrócić; oba są pokazane obok siebie. Dodane języki to tłumaczone szkice: przeczytaj je przed publikacją.

> **Warning:** Tekst napisany i przetłumaczony maszynowo bywa błędny lub niezgrabny. Zawsze przeczytaj podgląd, zwłaszcza w językach, których nie znasz.

## Przed publikacją

- Save lub Publish osadza zadania opowieści w pliku `.map`, jak każde inne zadania.
- Identyfikatory i teksty dialogów są wspólne dla wszystkich map i plików zip w grze. Opowieść poprzedza wszystko nazwą twojej mapy; lista Problemów ostrzega przed identyfikatorami dialogów, które się od niej nie zaczynają.
- Przetestuj opowieść w grze. Warto zwrócić uwagę na dwie rzeczy: krok może zacząć się w turze po tej, w której skończył się poprzedni, a zakończenie używa zamknięcia ostatniego dialogu, aby dać graczowi zwycięstwo.

> **Note:** Jeśli licznik jest zmieniany, ale nigdy sprawdzany, albo sprawdzany, ale nigdy zmieniany, lista Problemów o tym informuje. Po ręcznej edycji opowieści zajrzyj tam najpierw.
