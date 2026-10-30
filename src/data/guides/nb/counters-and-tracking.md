---
title: Tellere og sporing
category: concepts
order: 2
---

## Hva tellere er

Tellere er heltallsvariabler knyttet til scenarioet. De deklareres i fanen **Tellere** med en SID og en startverdi, og de består så lenge kartet eksisterer.

De er det viktigste verktøyet for å spore oppdragsfremdrift, antall drepte, ressursmilepæler og forgreningslogikk.

## Deklarere en teller

Legg til en teller i fanen Tellere. Angi:
- `sid` — en unik tekststreng som identifikator, f.eks. `dragons_killed`
- `value` — startverdi, nesten alltid `0`

Bruk beskrivende SID-er — du kommer til å referere til dem ved navn i all utløserlogikken din.

> **Note:** Tellere vises ikke i kartredigereren. De finnes bare i JSON-en og er usynlige til kartet kjører i spillet.

## Endre tellere

Fire handlinger endrer tellerverdier:

- `CounterSet` — setter en bestemt verdi
- `CounterPlus` — øker med et beløp
- `CounterMinus` — reduserer med et beløp
- `CounterSetRandom` — setter en tilfeldig verdi mellom min og maks

## Sjekke tellere

Bruk betingelsen `Counter` for å sammenligne verdien til en teller:

- `quest_stage = 2` — nøyaktig på trinn 2
- `dragons_killed >= 5` — minst 5 drept
- `quest_stage != 0` — oppdraget har startet

## Mønster for oppdragstrinn

Det vanligste tellermønsteret er en **teller for oppdragstrinn**:

1. Legg til en teller `quest_main_stage` med startverdi `0`
2. Når hvert trinn er fullført, kjør `CounterSet quest_main_stage → N`
3. Lås neste utløser med `Counter: quest_main_stage = N`

Dette sikrer at trinnene utløses i rekkefølge og bare én gang.

## Mønster for antall drepte

For å kreve at N av noe blir drept:

1. Legg til en teller `kills_count` med startverdi `0`
2. Legg til en `UnitKill`-utløser med handlingen `CounterPlus kills_count 1` — sett `repeat: true`
3. Legg til en andre utløser: når `Counter: kills_count >= N`, utløs fullføringen

Alternativt kan du bruke det innebygde ekstrafeltet Counter i betingelsen `UnitKill` for å angi terskelen direkte, uten en egen teller.

## Tilfeldig forgrening

Bruk `CounterSetRandom` for å forgrene tilfeldig:

1. Sett telleren `branch` til en tilfeldig verdi mellom 1 og 3
2. Legg til tre separate utløsere som hver sjekker `Counter: branch = 1`, `= 2`, `= 3`
3. Hver gren utløser en ulik dialog eller et ulikt utfall

Bra for stemningshendelser og variasjon i tilfeldige møter.
