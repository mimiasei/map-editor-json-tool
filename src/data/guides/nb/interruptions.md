---
title: Avbrudd
category: concepts
order: 3
---

## Hva avbrudd er

Avbrudd er den tredje matrisen på øverste nivå i en scenariofil, ved siden av `counters` og `quests`. De er **kroker i kamplivssyklusen** — de utløses når bestemte heltekamphendelser inntreffer, ikke når betingelser er oppfylt.

Et avbrudd har:
- `sid` — unik identifikator brukt av `EnableInterruption` / `DisableInterruption`
- `interruption` — hendelsestypen som utløser det (se nedenfor)
- `activeOnStart` — om det er aktivt når kartet lastes
- `p` — parametere (typisk en helts entitets-SID for å avgrense kroken)
- `actions` — hva som kjører når hendelsen utløses (samme handlingstyper som i oppdragsutløsere)

## Avbrudd utløses ubegrenset antall ganger

I motsetning til oppdragsutløsere (som utløses én gang som standard), **utløses et avbrudd hver gang hendelsen inntreffer, uten grense, helt til det eksplisitt deaktiveres** via `DisableInterruption`. Hvis du bare vil at det skal utløses én gang, deaktiver det fra sin egen handlingsliste.

## Avbruddstyper

| Type | Utløses når |
|----------------------|---------------------------------------------------------------|
| `BeforeIamVsHero` | Før kamp — spillerens helt skal til å kjempe mot en fiendtlig helt |
| `AfterIamWinVsHero` | Etter at spillerens helt vinner mot en fiendtlig helt |
| `BeforeHeroVsHero` | Før en hvilken som helst helt-mot-helt-kamp (uavhengig av hvem spilleren er) |
| `AfterHeroWinVsHero` | Etter at en hvilken som helst helt vinner en helt-mot-helt-kamp |

Matrisen `p` avgrenser kroken til bestemte helter. For eksempel gjør `p` satt til `['E_Hero_Xarfax']` på et `BeforeIamVsHero`-avbrudd at det bare utløses når spillerens helt skal til å kjempe mot Xarfax — ikke mot hver fiendtlig helt.

> **Note:** I motsetning til oppdragsutløsere har avbrudd ingen betingelser å konfigurere. Typen `interruption` er betingelsen. Motoren bestemmer når det utløses.

## Hvordan avbrudd skiller seg fra oppdragsutløsere

Oppdragsutløsere evaluerer betingelser og utløses når betingelsene er oppfylt. Avbrudd er annerledes: spillet kaller dem på bestemte tidspunkter i kamplivssyklusen, før eller etter kampavgjørelsen.

Avgjørende er at **avbrudd er den eneste måten å pause standard spilllogikk på** — for eksempel å omgå den automatiske kampstarten når en helt går inn i en fiende. En oppdragsutløser som utløses i det samme øyeblikket kan ikke gjøre dette; handlingene kjører, men avbryter ikke kampsekvensen. Et avbrudd med `BeforeIamVsHero` kan vise en dialog før kampskjermen i det hele tatt lastes.

Dette gjør avbrudd uunnværlige for:
- **Fredelige møter** — hindre at kamp starter og vise en dialog i stedet
- **Stemning før kamp** — en skurks hån før kampen
- **Belønninger etter kamp** — gi gjenstander eller gå videre i oppdrag etter en bestemt kamp

## Vanlige bruksområder

**Dialog før kamp (skurkens hån)**

Vis en dialog før spilleren kjemper mot en viktig fiendtlig helt:

1. Legg til et avbrudd med typen `BeforeIamVsHero`
2. Sett `p` til den fiendtlige heltens entitets-SID
3. Sett `activeOnStart: true`
4. Legg til en `Dialog`-handling

Dialogen utløses i det øyeblikket spilleren klikker for å angripe den helten, før kampskjermen lastes.

**Belønning og oppdragsfremdrift etter kamp**

Etter at spilleren har beseiret en sjefshelt, gå videre i oppdraget og gi en belønning:

1. Legg til et avbrudd med typen `AfterIamWinVsHero`
2. Sett `p` til sjefsheltens entitets-SID
3. Legg til handlinger: `Dialog` (seierstale), `GiveRes` (belønning), `CurrentSubQuestDone` eller `CounterSet`

> **Warning:** `AfterIamWinVsHero` utløses når spilleren vinner. Hvis spilleren taper kampen, utløses det ikke. Ikke stol på det for «kampen har funnet sted»-logikk — bare for «spilleren vant»-logikk.

**Sjefskamp (kombinert før + etter)**

For en full sjefskampopplevelse, bruk to avbrudd på den samme heltens SID:

- `BeforeIamVsHero` → hån-dialog
- `AfterIamWinVsHero` → belønning + oppdragsfremdrift

**Utløs bare én gang**

Hvis du bare vil at avbruddet skal utløses første gang spilleren møter helten:

1. Sett `activeOnStart: true`
2. Som siste handling i avbruddet, legg til `DisableInterruption` med avbruddets egen SID

**Betinget aktivering**

Hvis avbruddet bare skal være aktivt under et bestemt oppdragstrinn, sett `activeOnStart: false` og aktiver det fra en oppdragsutløser:

1. Legg til `EnableInterruption` med avbruddets SID i en oppdragsutløser
2. Etter at kampen er avgjort (eller ved et oppdragstrinnskifte), legg til `DisableInterruption` for å rydde opp

Dette hindrer avbruddet i å utløses før eller etter det tiltenkte vinduet.

## Parametere (p)

Hva matrisen `p` betyr avhenger av typen. For de fire kjente typene er `p[0]` **heltens entitets-SID** — den bestemte helten avbruddet er avgrenset til. Hvis `p` er tom, utløses avbruddet for hvilken som helst helt som passer til typen.

> **Note:** Heltens entitets-SID-er angis i kartredigereren når du plasserer en helt på kartet. De ser ut som `E_Hero_Xarfax` eller `E_Hero_SomeVillain`. Sjekk kartredigererens egenskapspanel for det plasserte helteobjektet.

## Aktivere og deaktivere under kjøring

Bruk handlingene `EnableInterruption` og `DisableInterruption` (tilgjengelige i en hvilken som helst oppdragsutløser eller et annet avbrudds handlingsliste) for å slå avbrudd av og på:

- `EnableInterruption` — aktiverer avbruddet slik at det utløses ved neste samsvarende hendelse
- `DisableInterruption` — deaktiverer det slik at det ikke utløses igjen før det aktiveres på nytt

Begge handlingene tar avbruddets `sid` som parameter.
