---
title: Tidsstyrte hendelser
category: recipes
order: 2
---

## Oversikt

Tidsstyrte hendelser utløses etter at et visst antall turer har gått. De er nyttige for:

- Fristoppdrag («beseir fienden innen 20 turer, ellers taper du»)
- Periodiske forsterkninger («hver uke får spilleren 3 bueskyttere»)
- Eskalerende trusler («hvis oppdraget ikke er ferdig innen tur 15, spawn en sterkere fiende»)

## Frist basert på tur

For å utløse noe på en bestemt tur:

1. Legg til en utløser med en `StartTurn`-betingelse
2. Sett **Turnummer** til ønsket tur (f.eks. `15`)
3. Sett **Spiller** til `1` (første spiller)
4. Legg til handlingene dine (f.eks. `Dialog`, `GameLose`, `SpawnHero`)

## Turtellermønster

For mer fleksibel timing — f.eks. «etter at oppdraget starter, vent 10 turer»:

1. Når oppdraget starter, bruk `CounterSet turn_timer 0`
2. Legg til en gjentakende utløser med `StartTurn` (ingen parametere) og `CounterPlus turn_timer 1`
3. Lås fristutløseren din med `Counter: turn_timer >= 10`

Dette måler turer som har gått siden oppdraget begynte, ikke absolutt turnummer.

## Ukentlige gjentakende hendelser

For å utløse noe hver uke:

1. Legg til en utløser med en `StartWeek`-betingelse
2. Sett `repeat: true`
3. Legg til handlingene dine (f.eks. `GiveRes gold 200`)

Dette utløses automatisk hver 7. tur så lenge kartet varer.

> **Warning:** Ukentlige gjentakende utløsere uten tellervern utløses i det uendelige. Hvis du vil at de skal stoppe etter N uker, legg til en teller og øk den hver uke, og beskytt så med `Counter: weeks_elapsed < N`.

## Avbrudd for kamptiming

Avbrudd er ikke tidsbaserte — de er kroker i kamplivssyklusen (`BeforeIamVsHero`, `AfterIamWinVsHero` osv.). De er nyttige når du trenger at noe skjer ved en bestemt heltekamp i stedet for ved en bestemt tur.

For turbaserte stemningstidtakere, bruk oppdragsutløsere med betingelsene `StartTurn` eller `StartWeek` som beskrevet ovenfor. Se [Avbrudd](guide:interruptions) for hva avbrudd faktisk brukes til.
