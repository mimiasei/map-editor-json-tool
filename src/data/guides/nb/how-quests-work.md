---
title: Slik fungerer oppdrag
category: getting-started
order: 1
---

## Hierarkiet

En scenariofil inneholder tre matriser på øverste nivå: `counters`, `quests` og `interruptions`.

Hvert **oppdrag** har ett eller flere **underoppdrag**. Hvert underoppdrag har én eller flere **utløsere**. Hver utløser har **betingelser** og **handlinger**.

Når en utløsers betingelser er oppfylt, utløses handlingene.

## Oppdrag

Et oppdrag er beholderen på øverste nivå. Det vises i oppdragsloggen i spillet. Feltene `name` og `description` er lokaliserings-SID-er — de må ha samsvarende tokens i kartets `customMaps.json`.

Et oppdrag er aktivt når spillet starter med mindre du setter `activeOnStart: false`.

> **Note:** Oppdragsnavn og -beskrivelser vises til spilleren. De må være lokalisert — rå tekst vises ikke i oppdragsloggen.

## Oppdragsflagg: main, hidden, sharing

Tre valgfrie flagg på et oppdrag endrer hvordan spillet behandler det.

**`main: true`** markerer et oppdrag som kartets primærmål. I oppdragsloggen i spillet vises dette som hovedoppdraget i stedet for et sidemål. Ser man på de offisielle scenariofilene, er dette satt på oppdrag som `main_quest_line` og `city_attack_quest_line_starter` — oppdragene spilleren forventes å fokusere på. Sideoppdrag, AI-oppførselsoppdrag og bakgrunnssporingsoppdrag lar det være usatt (standard `false`).

**`hidden: true`** skjuler oppdraget helt fra spillerens oppdragslogg. Bruk dette for oppdrag som bare finnes for intern logikk — AI-bevegelsesskripting, bakgrunnstidtakere, tapsbetingelser — som aldri skal være synlige for spilleren.

**`sharing`** styrer hvordan oppdraget fordeles i flerspiller. To verdier sees i de offisielle scenariofilene:

- `"Clone"` — hver spiller får sin egen uavhengige kopi av oppdraget. Fremdriften spores separat per spiller. Dette er standard for alle vanlige oppdrag — spiller mot sideoppdrag, mål osv.
- `"Ai"` — oppdraget evalueres bare for AI-styrte spillere. Brukes på skjulte oppdrag som skripter AI-heltenes oppførsel (f.eks. patruljeruter, bevegelsesmønstre). Menneskelige spillere samhandler aldri med disse oppdragene.

> **Note:** `sharing` kreves av spillmotoren — sett det alltid. Redigereren setter nye oppdrag til `"Clone"` som standard, som er riktig for alle spillervendte oppdrag.

## Oppdragsisolasjon

Innholdet i hvert oppdrag er helt isolert fra alle andre oppdrag. Det betyr at entitets-SID-er, tellerreferanser og andre identifikatorer kan gjentas på tvers av ulike oppdrag uten konflikt.

## Underoppdrag

Underoppdrag er trinnene i et oppdrag. Et enkelt oppdrag kan ha bare ett underoppdrag. Et oppdrag i flere trinn (f.eks. «finn tre relikvier») har flere underoppdrag som aktiveres i rekkefølge.

Bruk handlingene `CurrentSubQuestDone` eller `SubQuestDone` for å fullføre et underoppdrag og gå videre til neste.

## Underoppdragsgrupper — parallelle trinn

Underoppdrag kan kombineres til **underoppdragsgrupper**. Dette lar spillet behandle flere parallelle trinn som én enhet — neste trinn låses bare opp når alle er ferdige.

**Eksempel:** Underoppdrag 3 «Beseir den siste sjefen» skal bare aktiveres etter at spilleren har fullført både underoppdrag 1 «Finn det legendariske sverdet» OG underoppdrag 2 «Finn det legendariske skjoldet».

I stedet for å lage hjelpeoppdrag som er skjult for å spore dette, kan du:

1. Definere en underoppdragsgruppe (f.eks. `subquest_group_relics`)
2. Tilordne underoppdrag 1 og underoppdrag 2 til den
3. Avslutte begge underoppdragene med `NextAfterGroup` i stedet for `NextSubQuest`, og oppgi gruppe-SID-en og mål-underoppdragets SID som parametere

Underoppdrag 3 blir først aktivt etter at begge underoppdragene i gruppen har kalt `NextAfterGroup`.

> **Note:** Dette konfigureres via handlingene `NextAfterGroup` eller `NextQuestAfterGroup`. Gruppe-SID-en defineres i delen `subQuestGroups` i oppdraget.

## Utløsere

Utløsere er logikkenhetene. Hver utløser lytter etter betingelsene sine og utløser handlingene sine når de er oppfylt.

En utløser utløses **én gang** som standard. Sett `repeat: true` for at den skal utløses hver gang betingelsene blir oppfylt.

> **Warning:** Gjentakende utløsere uten betingelser (eller med alltid sanne betingelser) utløses hver spill-tick. Beskytt alltid gjentakende utløsere med minst én teller- eller tilstandssjekk.

## Utløsernes kjørerekkefølge

Hvis flere utløsere i samme underoppdrag utløses samtidig, kjøres handlingene deres i deklarasjonsrekkefølge: alle handlingene til den første utløseren kjører først, deretter alle til den andre, og så videre. Husk dette når én utløsers handlinger påvirker betingelsene til en annen utløser i samme underoppdrag.

## Entitets-SID-er — koble utløsere til kartobjekter

Mange betingelser og handlinger må referere til et **bestemt objekt plassert på kartet** — en nøytral stabel, en by, en helt, en ressursoppsamling, en portal osv. Dette gjøres via en **entitets-SID**.

I kartredigereren har hvert interaktivt objekt et **Entity**-felt i egenskapspanelet sitt. Når du setter dette feltet, får den enkelte plasserte forekomsten en unik identifikator, atskilt fra typen. For eksempel kan en drage-stabel plassert nær startbyen få entitets-SID-en `E_Squad_Dragon`. En portal kan hete `portal_south`.

Denne entitets-SID-en skriver du inn i den aktuelle parameteren i denne redigereren. For eksempel:

- Betingelsen `SquadKill` — skriv inn entitets-SID-en til den plasserte nøytrale stabelen
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — skriv inn entitets-SID-en til kartobjektet spilleren går inn på
- Handlingen `DeleteEntity` — skriv inn entitets-SID-en til objektet som skal fjernes
- Handlingen `SetQuestMarker` — skriv inn entitets-SID-en til objektet som skal merkes

> **Note:** Entitets-SID-er er ikke det samme som type-SID-er. `E_Squad_Dragon` er den *plasserte forekomsten* av en stabel; `Dragon` er enhetstypen. Bruk alltid entitets-SID-en (fra Entity-feltet i kartredigereren) når en betingelse eller handling ber om en objektreferanse.

## Betingelser

Betingelser kombineres med OG- eller ELLER-logikk (satt per utløser). Hvis det ikke finnes noen betingelser, utløses utløseren umiddelbart når underoppdraget er aktivt.

Se [Utløsere og betingelser](guide:triggers-and-conditions) for en full gjennomgang.

## Handlinger

Handlinger kjøres i rekkefølge når alle betingelser er oppfylt. Vanlige handlinger: vise en dialog, fullføre et underoppdrag, gå videre til neste oppdrag, gi ressurser eller gjenstander til spilleren, eller utløse seier/tap.

## Tellere

Tellere er heltallsvariabler som består så lenge kartet eksisterer. De deklareres i fanen Tellere og refereres til med SID.

Bruk dem til å spore oppdragstrinn, antall drepte, ressursgrenser og mer. Se [Tellere og sporing](guide:counters-and-tracking).

## Avbrudd

Avbrudd er kroker i kamplivssyklusen — de utløses når bestemte heltekamphendelser inntreffer, for eksempel før spilleren kjemper mot en fiendtlig helt eller etter at en helt-mot-helt-kamp er vunnet. De har ingen betingelser å konfigurere; selve hendelsestypen bestemmer når de utløses.

Bruk dem til dialoger før kamp, belønninger etter kamp og sjefskampsekvenser. De kan slås av og på under kjøring via handlingene `EnableInterruption` og `DisableInterruption`.

Se [Avbrudd](guide:interruptions) for en full gjennomgang.
