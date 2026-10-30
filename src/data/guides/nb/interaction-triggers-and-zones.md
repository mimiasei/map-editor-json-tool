---
title: Samhandlingsutløsere og utløsersoner
category: concepts
order: 4
---

## Hva samhandlingsutløsere er

Samhandlingsutløsere er korte, enkle handlingssekvenser knyttet direkte til et kartobjekt i Unfrozens kartredigerer. De utløses når en spillers helt samhandler med objektet — enten **før** objektets egen effekt aktiveres (Actions Before) eller **etter** den (Actions After).

> **Note:** Samhandlingsutløsere konfigureres i egenskapspanelet til objektet i Unfrozens kartredigerer — ikke i dette verktøyet. Denne guiden forklarer hvordan de fungerer, slik at du forstår hele skriptbildet og når du bør bruke dem i stedet for utløsere i oppdragsfilen.

## Hvordan de skiller seg fra oppdragsutløsere

Den avgjørende forskjellen: **samhandlingsutløsere avbryter standard spilllogikk fullstendig.** En oppdragsutløser utløser handlingene sine, men kan ikke pause eller utsette det spillet ellers ville gjort i det øyeblikket. En samhandlingsutløser kan.

For eksempel:
- En oppdragsutløser som utløses når spilleren samhandler med en tropp, kan ikke hindre at kampen starter — dialogen åpnes og lukkes umiddelbart idet kampen begynner.
- En Actions Before-utløser på den samme troppen *kan* vise en dialog før kampskjermen lastes. Dødsanimasjonen etter kampen spilles også først *etter* at en Actions After-dialog er ferdig.

Dette gjør samhandlingsutløsere til det riktige verktøyet for:
- Dialog som må spilles før en kamp eller et opptak avgjøres
- Sekvenser i filmstil ved bestemte objektsamhandlinger
- Alle øyeblikk der du må pause den normale spillflyten

For dialoger ved helt-mot-helt-møter spesielt, bruk [Avbrudd](guide:interruptions) i stedet — samhandlingsutløsere kan ikke knyttes til helter.

## Actions Before mot Actions After

| Egenskap | Når den utløses |
|---|---|
| Actions Before | Før objektets egen effekt kjører (før kampen starter, før ressursen samles osv.) |
| Actions After | Etter at objektets effekt er avgjort (etter at kampen er over, etter opptak osv.) |

Begge kan knyttes til det samme objektet samtidig. Rekkefølgen handlingene legges til i innenfor hver egenskap bestemmer rekkefølgen de kjøres i.

> **Warning:** Hvis færre eller flere parametere er satt for en handling enn den tar imot, vil handlingen ikke utløses. Dette er den samme regelen som for handlinger i oppdragsfilen.

## Avkrysningsboksen Repeat

Hver Actions Before / Actions After-egenskap har en **Repeat**-avkrysningsboks. Hvis den er slått på, utløses handlingene hver gang en helt samhandler med objektet. Hvis den er av (standard), utløses handlingene bare én gang — første gang.

## Input sides IDs

Feltet **input sides IDs** på en samhandlingsutløser begrenser hvilke spillere som utløser handlingene. Skriv inn spillerindekser (0-baserte) for å begrense utløseren. For eksempel betyr `1` at handlingene bare utløses når spiller 2 sin helt samhandler med objektet.

Hvis feltet står tomt, utløses handlingene for hvilken som helst spiller.

## Utløsersoner

En **utløsersone** er en spesiell type usynlig objekt som plasseres på kartet fra redigererens hovedverktøypanel. I stedet for å være knyttet til et bestemt objekt, utløses handlingene når en helt går inn på en av cellene dens.

Viktige oppførsler fra den offisielle guiden:

- **Bevegelsen avbrytes** når en helt går inn i en utløsersone, uansett hva den tilknyttede handlingen gjør eller om den har noen synlig effekt. Selv en enkelt `Print`-handling (utskrift til utviklerkonsollen) vil stoppe helten midt på stien.
- **Flyvende helter** aktiverer ikke en utløsersones handlinger hvis de flyr over den og lander utenfor området. De aktiverer den hvis de lander innenfor.
- **Avkrysningsboksen Repeat** på en utløsersone fungerer på samme måte som på objektutløsere. Uten den utløses sonen bare ved første innganger. Med den utløses sonen hver gang en helt går inn utenfra — men ikke mens en helt beveger seg rundt inne i sonen.
- **Å deaktivere en sone** via handlingen `SetActiveMarker` (eller ved å fjerne avkryssingen for «Activate» i redigereren) hindrer den helt i å avbryte heltebevegelse.

> **Note:** `SetActiveMarker` er tilgjengelig i handlingsredigereren i dette verktøyet. Bruk den fra en oppdragsutløser for å slå utløsersoner av og på dynamisk under kjøring.

## Hva denne redigereren håndterer

Denne redigereren styrer **oppdragsfilen** (`map_name.json`) — delene `counters`, `interruptions` og `quests`. Samhandlingsutløsere og utløsersoner knyttes til objekter i **Unfrozens kartredigerer** og er ikke en del av oppdragsfilen.

Du kan imidlertid bruke handlinger som er tilgjengelige i denne redigereren til å påvirke soner under kjøring:
- `SetActiveMarker` — slå en utløsersone av eller på etter entitets-SID-en

Se [Avbrudd](guide:interruptions) for oppdragsfil-tilnærmingen til å pause spilllogikken ved heltemøter.
