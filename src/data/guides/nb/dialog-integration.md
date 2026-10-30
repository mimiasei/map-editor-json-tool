---
title: Dialogintegrasjon
category: recipes
order: 1
---

## Oversikt

Dialoger i HoMM:OE er definert som egne JSON-filer i `DB/dialogs/dialogs/`. Hver dialog har en unik ID og inneholder ett eller flere lysbilder (tekst + taler-info).

Handlingen `Dialog` spiller av en dialog etter ID. Handlingen `RandomDialog` spiller av en av flere dialoger tilfeldig.

## Opprette en dialog

Bruk **Dialogredigereren** (nås fra Dialoger-panelet eller via snarveien «Rediger dialog →» i en Dialog-handling). Hvert dialoglysbilde har en tekst-lokaliserings-SID, en valgfri taler og valgfri portrettinfo.

Alle SID-er for lysbildetekst må legges til i kartets lokalisering via dialogen **Lokalisering**.

## Bruke Dialog-handlingen

Legg til en `Dialog`-handling i en hvilken som helst utløser. Sett **Dialognøkkel** til den nøyaktige SID-en til dialogen du opprettet.

Dialogen utløses når utløserens betingelser er oppfylt.

> **Note:** Dialogen og alle lokaliseringstokenene må være med i kart-ZIP-en din. Bruk **Eksporter ZIP** for å pakke alt sammen.

## Dialoger ved objektsamhandling

Et vanlig mønster er å vise en dialog når spilleren samhandler med et kartobjekt:

1. Legg til en utløser i et underoppdrag
2. Legg til en `ObjectInteractionBefore`-betingelse — sett entitets-SID-en til kartobjektet ditt
3. Legg til en `Dialog`-handling

Dialogen utløses før standard objektsamhandling (skatteopptak, kamp osv.).

## Ta med dialoger i kart-ZIP-en

Spillet leser dialoger fra mappen `DB/dialogs/` i kart-ZIP-en. Redigereren styrer dette for deg: når du bruker **Eksporter ZIP**, tas alle dialoger lagt til via Dialogredigereren automatisk med.

Ikke plasser dialogfiler manuelt i ZIP-en — redigereren håndterer strukturen.

> **Warning:** Hvis du refererer til en dialog-ID som ikke finnes i ZIP-en, hopper spillet stille over den uten feilmelding. Test alltid dialogutløsere i spillet.
