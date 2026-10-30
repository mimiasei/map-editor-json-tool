---
title: Teste kartet ditt
category: troubleshooting
order: 1
---

## Kartredigereren gjenspeiler ikke JSON-endringer

Dette er det viktigste å forstå: **endringer du gjør i denne redigereren — oppdragslogikk, tellere, utløsere — er usynlige i HoMM:OE-kartredigereren.** Kartredigereren viser bare det visuelle laget (terreng, objekter, helter på kartet).

JSON-endringene dine leses av **spillmotoren under kjøring**, ikke av kartredigereren.

> **Warning:** Ikke åpne den lagrede kartfilen i HoMM:OE-kartredigereren og forvent å se oppdragslogikk. Du vil bare se det visuelle laget. Spillet leser JSON-en riktig under kjøring.

## Testarbeidsflyten

Riktig arbeidsflyt for å teste oppdragslogikk:

1. Gjør endringene dine i denne redigereren
2. **Lagre som** (eller Eksporter) for å få den oppdaterte JSON-filen
3. Bytt ut scenario-JSON-en i kartfilen din (eller plasser den der spillet forventer den)
4. Last kartet i HoMM:OE
5. Test det aktuelle scenarioet i spillet
6. Gjenta

## Finne scenario-JSON-en i et kart

En `.homm`-kartfil er en ZIP. Pakk den ut og finn `scenario.json` (eller en tilsvarende navngitt fil) i roten eller mappen `DB/`. Bytt den ut med den oppdaterte JSON-en din, og pakk så arkivet til ZIP igjen.

> **Note:** Ta vare på en sikkerhetskopi av det opprinnelige kartet før du bytter ut filer.

## Bruk validering først

Før du tester i spillet, klikk **Valider** i verktøylinjen. Valideringen fanger opp:

- Manglende lokaliseringstokens
- Tellerreferanser som ikke samsvarer med deklarerte tellere
- Referanser til oppdrags-/underoppdrags-SID-er som ikke finnes
- Tomme påkrevde parametere

Rett opp alle feil før du tester. Advarsler er informative — spillet kan fortsatt kjøre riktig.

## Tips for rask iterasjon

- Bruk `CounterSet` for å spole frem oppdragstilstand i en testutløser (f.eks. sett `quest_stage` til 5 på tur 1 for å teste logikk sent i spillet)
- Bruk `SpawnHero` for å plassere en bestemt helt for å teste betingelser som krever at en helt finnes
- Bruk `RevealFogOfWar` ved kartstart med en stor radius for å se alt under testing
