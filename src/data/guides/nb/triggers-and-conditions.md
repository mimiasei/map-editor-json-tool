---
title: Utløsere og betingelser
category: concepts
order: 1
---

## Hvordan utløsere fungerer

En utløser ligger inni et underoppdrag. Hver utløser lytter etter betingelsene sine og utløser handlingene sine når de er oppfylt. En utløser utløses **én gang** som standard og deaktiveres deretter. Sett `repeat: true` for kontinuerlige utløsere (f.eks. ukentlige ressurstildelinger).

> **Note:** Utløsere evalueres ikke kontinuerlig for hver spill-tick. Betingelser er **engangslyttere** — hver betingelse utløses i det øyeblikket kravet først er oppfylt, og deaktiveres så permanent. En betingelse aktiverer seg ikke på nytt og utløses ikke igjen, selv om kravet senere ikke lenger er oppfylt.

## Betingelser er engangslyttere

Dette er den viktigste regelen å ta inn over seg: **hver betingelse er en hendelseslytter som kjører én gang, ikke en kontinuerlig tilstandssjekk.**

Når en betingelses krav er oppfylt for første gang, utløses den — og slår seg så av. Den utløses aldri igjen med mindre utløseren evalueres på nytt fra bunnen av (f.eks. via `TriggerClear`).

For eksempel: en `Counter`-betingelse satt til `quest_stage >= 2` som allerede har utløst, vil *ikke* oppdage om `quest_stage` senere faller tilbake under 2. Den utløste én gang; den er ferdig.

> **Note:** Dette gjelder alle betingelser. Planlegg logikken rundt øyeblikket en tilstand endres, ikke rundt en pågående tilstand.

## OG mot ELLER-logikk

Hver utløser har innstillingen `conditionsLogic`: **OR** (én enkelt betingelse må utløses) eller **AND** (alle betingelser må hver utløse minst én gang).

For kompleks logikk — f.eks. «(A og B) eller C» — bruk flere utløsere med separate betingelsessett.

### AND-logikk og TriggerClear-problemet

Fordi betingelser er engangslyttere, utløses **AND**-logikk så snart hver betingelse har utløst én gang — selv om de aldri skjedde samtidig. Hvis utløseren din for eksempel krever «spilleren eier by A **OG** spilleren eier by B», utløses hver eierskapsbetingelse uavhengig når den først er oppfylt. Så lenge begge til slutt utløses (i hvilken som helst rekkefølge), kjøres utløseren.

Dette kan gi uventede resultater hvis en betingelse utløses og deretter «ugyldiggjøres» (f.eks. spilleren mister byen umiddelbart). For å tilbakestille alle betingelser på en utløser og begynne på nytt, bruk handlingene **`TriggerClear`** eller **`TriggerClearCustom`**, som sletter den utløste tilstanden til betingelsene i en bestemt utløser.

## Betingelser sjekkes bare for aktive oppdragseiere

Betingelser evalueres bare for spillere som har oppdraget som inneholder dem aktivt. Hvilke spillere som har et oppdrag bestemmes av oppdragets felt `sharing`. En betingelse *kan* likevel referere til helter eller objekter som tilhører andre spillere — hvis deres bestemte entitets-SID-er brukes i parameterne.

## Hendelsesbaserte betingelser

Disse betingelsene utløses når en bestemt hendelse inntreffer:

- `SquadKill` — en nøytral tropp er beseiret
- `HeroKill` — en bestemt helt er beseiret
- `SquadInteraction` — spilleren nærmer seg en nøytral tropp
- `ObjectInteractionBefore` / `ObjectInteractionAfter` — spilleren samhandler med et kartobjekt
- `ObjectLose` — spilleren mister et erobrebart objekt
- `ObjectCaptureEntity` — spilleren erobrer et objekt
- `NodeRevealed` — krigståken løftes ved en node
- `PlayerDefeated` — en spiller er eliminert

## Tilstandsbaserte betingelser

Disse betingelsene sjekker gjeldende spilltilstand i det øyeblikket de først evalueres:

- `Counter` — sjekker verdien til en teller: `quest_stage >= 2`
- `UnitOwnSide` / `UnitOwnHero` — sjekker antall enheter i hærer
- `ResCounter` — sjekker ressurslageret
- `ItemOwnSide` — sjekker eierskap til artefakter
- `DifficultyCustomMap` — sjekker kartets vanskelighetsinnstilling (indeks 0–4)

## Tidsbaserte betingelser

Disse betingelsene utløses på bestemte tidspunkter:

- `StartTurn` — utløses ved starten av en bestemt uke/dag for en bestemt spiller. Parametere: `weekNumber`, `dayNumber`. Bruk ekstrafeltet `counter` for «etter X dager totalt» i stedet.
- `StartWeek` — utløses ved starten av en hvilken som helst uke (hver 7. tur). Ingen påkrevde parametere; støtter det valgfrie ekstrafeltet `counter`.
- `AnyStartTurn` — utløses ved starten av en hvilken som helst spillers tur. Parametere: `month`, `week`, `day` (bruk -1 for hvilken som helst).

## Ekstrafeltet counter

Noen betingelser (`UnitKill`, `UnitLose`, `UnitHire`, `StartTurn`, `StartWeek`) har et ekstra **Counter**-felt. Det setter en terskel: betingelsen utløses først etter at den er oppfylt N ganger.

For eksempel: `UnitKill` med `counter: 10` utløses først etter at 10 av den enhetstypen er drept.

> **Note:** Dette tellerfeltet er atskilt fra systemet med teller-SID-er — det er et rått tall, ikke en referanse til en navngitt teller.

## Ingen betingelser

En utløser uten betingelser utløses umiddelbart når underoppdraget blir aktivt. Bruk dette til «ved oppdragsstart»-handlinger som å vise en innledningsdialog eller plassere oppdragsmarkører.

> **Warning:** En utløser uten betingelser kombinert med `repeat: true` utløses hver tick. Det er nesten aldri det du vil.
