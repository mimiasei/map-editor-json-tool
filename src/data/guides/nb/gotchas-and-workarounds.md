---
title: Fallgruver og løsninger
category: troubleshooting
order: 2
---

## Oppdragsfilen er obligatorisk — selv for samhandlingsutløsere

For at **noen som helst** skripting skal fungere på et kart, må det finnes en oppdragsfil `map_name.json` i samme mappe som `map_name.map`, og den må inneholde minst en tom `"quests"`-blokk. Uten den vil selv de enkleste samhandlingsutløserne knyttet til objekter via kartredigererens «Actions Before/After» ødelegge innlastingen av kartet fullstendig.

**Oppdrag kjører fra `.map`, ikke fra `.json`.** Spillet leser oppdrag fra Block 4 inni `.map` (merket av headerbyten etter versjonsstrengen, `0d 00` i stedet for `05 00`) og ignorerer tilhørende `.json` mens det spilles. Dette verktøyet bygger oppdragene inn i `.map` ved Lagre og ved Publiser; en `.json` redigert for hånd gjør ingenting før kartet lagres på nytt. To ting til som får et kart til å stille hoppe over oppdragene sine eller skjule seg fra listen: to `.map`-filer med samme header-hash (et kopiert kart trenger en ny hash), og `.zip`-filer i StreamingAssets der dialog-id-er eller tekst-tokens gjentar de i Core.zip eller en annen zip (de overskriver hverandre, så hold dem unike per kart).

> **Warning:** Opprett og eksporter alltid oppdragsfilen din før du tester skripting i spillet, selv om den bare inneholder en tom oppdragsmatrise.

## Én dårlig handling ødelegger hele utløseren

Hvis en handling i en utløser er skrevet feil — feil typenavn, feil antall parametere, ugyldig SID — vil den handlingen ikke utløses. **Det vil heller ingen andre handlinger i samme utløser.** Hele handlingslisten feiler stille.

> **Warning:** Hvis en utløser ikke ser ut til å gjøre noe som helst, sjekk hver handling for skrivefeil i typenavnet og feil antall parametere. Test med en enkel `Print`-handling først for å bekrefte at utløseren utløses.

## Handlinger kjøres umiddelbart — ikke sekvensielt i sanntid

Alle handlinger utløses etter hverandre uten å vente på at den forrige er ferdig (unntatt dialoger, som setter kjøringen på pause). Det betyr at to handlinger på rad som begge gir synlig bevegelse eller animasjon kan gi uventede resultater — bare utfallet av den siste vil være synlig.

For eksempel vil to `MoveCamera`-handlinger på rad få kameraet til å hoppe rett mot det andre målet, siden den første bevegelsen umiddelbart overstyres.

> **Note:** Hvis du trenger sekvensielle tidsstyrte handlinger (animer, pause, animer igjen), bruk dialoghandlinger som pauser mellom dem, eller utform utløseren om til flere underoppdragstrinn.

## Break-flagget på handlinger

Enhver handling kan ha det valgfrie feltet `"break": true`. Når en handling med `break: true` kjøres, hoppes alle gjenværende handlinger i utløseren over. Bruk dette til betinget forgrening — kombiner det med dialoghandlinger (`DialogIfHero`, `DialogIfRes`, `DialogIfCounter`) som bare kjører for bestemte spillere eller tilstander, og sett så `break: true` på de handlingene for å stoppe kjøringen for den spilleren før de felles handlingene kjører.

Eksempel: vis en spesiell dialog for helt A (med `break: true`), så kjører handlingene under bare for andre helter.

## OG-logikk utløses ved «begge har utløst én gang» — ikke «begge er sanne samtidig»

Fordi betingelser er engangslyttere, utløses `conditionsLogic: "And"` så snart hver enkelt betingelse har utløst én gang — selv om de aldri skjedde samtidig. Hvis en betingelse utløses og deretter «angres» (f.eks. spilleren erobrer en bygning og så mister den), utløses utløseren likevel når den andre betingelsen senere utløses, fordi den første betingelsen allerede har utløst.

For å tilbakestille betingelsene og begynne på nytt, bruk `TriggerClear` (tilbakestiller den gjeldende utløseren) eller `TriggerClearCustom` (tilbakestiller en bestemt utløser etter indeks i et annet underoppdrag).

## Utløsere utløses i deklarasjonsrekkefølge

Innenfor et underoppdrag evalueres utløserne i den rekkefølgen de er deklarert. Hvis to utløsere utløses i samme tick, utløses den første først. Husk dette når én utløsers handling aktiverer en annen utløsers betingelse.

> **Note:** Handlinger i en utløser kjøres også i rekkefølge. En `CounterSet` i handling 1 er synlig for en `Counter`-betingelsessjekk i neste utløser i samme tick.

## Gjentakende utløsere og uendelige løkker

En utløser med `repeat: true` og ingen betingelser (eller alltid sanne betingelser) utløses hver tick. Dette er nesten helt sikkert en feil.

**Beskytt alltid gjentakende utløsere** med minst én betingelse som blir usann etter ønsket antall utløsninger — typisk en Counter-sjekk.

> **Warning:** En utløser som utløses i det uendelige kan gjøre et kart uspillbart. Bruk Counter-vern på alle gjentakende utløsere.

## SquadKill utløses på troppens entitets-SID, ikke enhetstypen

Når du plasserer en nøytral stabel i kartredigereren, gir du den en entitets-SID (f.eks. `goblin_patrol_1`). Betingelsen `SquadKill` tar **denne entitets-SID-en**, ikke enhetstype-SID-en (f.eks. `goblin`).

Hvis du vil spore drap på alle goblins, bruk `UnitKill` med enhetstype-SID-en i stedet.

> **Note:** Entitets-SID-er angis i kartredigererens egenskapspanel for hvert plasserte objekt eller hver tropp.

## Dialoghandlinger feiler stille hvis dialogen mangler

Hvis en `Dialog`-handling refererer til en dialog-ID som ikke finnes i kart-ZIP-en, hopper spillet stille over den — ingen feil, ingen melding. De andre handlingene i utløseren utløses fortsatt.

Sjekk alltid at hver refererte dialog-ID finnes i den eksporterte ZIP-en din.

> **Warning:** Test alle Dialog-handlinger i spillet før du gir ut kartet ditt.

## Lokaliseringstokens må ligge i customMaps.json

Oppdragsnavn, beskrivelser, dialogtekst og alle andre strenger spilleren ser må ha oppføringer i `customMaps.json` inni kart-ZIP-en din.

Denne redigereren styrer lokaliseringstokens for deg. Bruk knappen **Lokalisering** i verktøylinjen for å legge til og redigere tokens. De tas automatisk med når du **Eksporter ZIP**.

> **Note:** Hvis en lokaliserings-SID mangler i customMaps.json, viser spillet den rå SID-strengen til spilleren (f.eks. «kill_quest_name» i stedet for «Hunt the Dragon»).

## SubQuestActivate mot NextSubQuest

Begge handlingene går videre med underoppdrag, men de virker ulikt:

- `NextSubQuest` aktiverer neste underoppdrag i rekkefølge (etter indeks eller SID) — bruk for lineær fremdrift
- `SubQuestActivate` aktiverer et hvilket som helst navngitt underoppdrag i et hvilket som helst oppdrag — bruk for forgrening eller samhandling på tvers av oppdrag

## DeleteHero utløser HeroKill

`DeleteHero` fjerner en helt fra kartet, og — som nederlag, retrett eller overgivelse i kamp — utløser dette betingelsen `HeroKill`. `DeleteHero` er en gyldig måte å simulere en helts død på for oppdragslogikk som avhenger av `HeroKill`.

## RemoveRes sjekker ikke tilgjengelighet

`RemoveRes` fjerner ressurser fra spillerens lager. Hvis spilleren ikke har nok, settes ressursen til 0 — den feiler ikke eller gir en feil. Sjekk alltid ressursnivåene først med en `ResCounter`-betingelse hvis nøyaktige mengder er viktige.
