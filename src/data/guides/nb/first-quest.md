---
title: Lag ditt første oppdrag
category: getting-started
order: 2
---

## Hva vi skal lage

Et enkelt oppdrag: spilleren må beseire en bestemt nøytral tropp. Når de gjør det, får de gull og oppdraget fullføres.

Du kan bruke malen **Simple Kill Quest** (Fil → Ny fra mal) for å laste inn en ferdig versjon av dette mønsteret.

## Trinn 1: Legg til en teller

Åpne fanen **Tellere** og legg til en ny teller. Gi den en beskrivende SID som `quest_target_killed`. Sett startverdien til `0`.

> **Note:** Kartredigereren viser ikke tellere — de finnes bare i JSON-en. Spillet leser og sporer dem riktig under kjøring.

## Trinn 2: Opprett oppdraget

I fanen **Oppdrag**, klikk **Legg til oppdrag**. Angi:
- `sid` — en unik identifikator, f.eks. `kill_quest`
- `name` — lokaliserings-SID for oppdragstittelen, f.eks. `kill_quest_name`
- `description` — lokaliserings-SID for beskrivelsen, f.eks. `kill_quest_desc`

Legg til lokaliseringstokenene i dialogen **Lokalisering** (verktøylinje → Lokalisering-knappen).

## Trinn 3: Legg til et underoppdrag

Legg til et **underoppdrag** inni oppdraget. Det representerer trinnet «drep målet». Gi det en SID som `kill_quest_1`.

## Trinn 4: Legg til en utløser

Legg til en **utløser** inni underoppdraget. Denne utløseren lytter etter drapet og utløser fullføringshandlingene.

## Trinn 5: Legg til SquadKill-betingelsen

Under utløserens **Betingelser**, legg til en **Squad Defeated**-betingelse. Sett Squad ID til entitets-SID-en du ga den nøytrale stabelen i kartredigereren (f.eks. `E_Squad_Dragon`).

> **Note:** Troppens entitets-SID angis i kartredigereren når du plasserer den nøytrale stabelen — det er ikke enhetstypenavnet.

## Trinn 6: Legg til fullføringshandlinger

Under utløserens **Handlinger**, legg til:
1. `CounterSet` — sett `quest_target_killed` til `1`
2. `GiveRes` — gi spilleren `500` gull som belønning
3. `CurrentSubQuestDone` — fullfør det gjeldende underoppdraget
4. `Dialog` — vis en fullføringsdialog (valgfritt, men anbefalt)

## Trinn 7: Legg til lokalisering

Åpne dialogen **Lokalisering** og legg til tokens:
- `kill_quest_name` → `'Hunt the Dragon'`
- `kill_quest_desc` → `'A dragon has been terrorizing the region. Defeat it.'`

Disse tokenene havner i kartets `customMaps.json` når du eksporterer ZIP-en.

## Trinn 8: Test

Eksporter prosjekt-JSON-en (Lagre som), plasser den i kartet ditt og last kartet i spillet. Se [Teste kartet ditt](guide:testing-your-map) for riktig arbeidsflyt.

> **Warning:** Kartredigereren viser IKKE endringer i oppdrag eller tellere visuelt. Du må laste kartet i spillet for å bekrefte at logikken fungerer.
