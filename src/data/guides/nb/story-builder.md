---
title: Historiebygger
category: recipes
order: 3
---

## Hva den gjør

Knappen **Historie** i verktøylinjen legger til en komplett, sammenhengende historie i kartet ditt: en kjede av oppdrag, dialogene som forteller den, og tellerne som husker hva spilleren valgte. Du peker på steder på kartet ditt og velger en tone; teksten skrives for deg. Alt den lager er helt vanlige oppdrag, tellere og dialoger, så du kan åpne og endre hva som helst av det etterpå som om du hadde skrevet det selv.

Ett angre fjerner historiens oppdrag og tellere. Dialogene og tekstene deres blir værende i prosjektet, så fjern dem fra Dialoger-listen hvis du ikke vil ha dem.

> **Note:** Åpne `.map`-filen din først, slik at historien kan tilby byene, hærene og objektene som finnes på kartet ditt. Gi kartet et navn i Kartinnstillinger, fordi alle id-er historien lager starter med det.

## Velge en historie

Velg en av de ferdige historiene, **Bygg min egen**, eller **Jeg har min egen idé**.

- **Ferdige historier** har hver minst ett ekte valg for spilleren: *Den forbannede myren* (følg spor, og anklag så noen), *Den lange beleiringen* (forbered deg, og overlev så et antall dager) og *Grenseeden* (ta en by, velg hvordan du behandler folkene der, og møt så en krigsherre).
- **Bygg min egen** lar deg stable trinn: en innledning, besøke steder, erobre en by, beseire en hær, samle gull, vente ut et antall dager, en belønning og spillervalg. En avslutning legges til for deg og reagerer på valgene.
- **Jeg har min egen idé** gjør noen få setninger fra deg selv, på et hvilket som helst språk, om til en historie av samme slag. Den krever tekstskriveren (se nedenfor).

## Peke på kartet ditt

Hver historie ber om noen ting fra kartet ditt, for eksempel en by å erobre eller steder å besøke. Veiviseren fyller inn forslag slik at du bare kan godta dem. For å endre ett, søk etter navn eller bruk knappen med nålen for å klikke på det i Kartrutenettet.

> **Note:** Bare objekter, byer og hærer som har et navn (en entitets-id) på kartet kan velges. Gi dem navn i spillets kartredigerer først.

## Spillervalg

Et valg er en dialog med to til fire svar. Hvert svar kan endre en teller, gi eller ta gull, og viser sin egen oppfølgingstekst. Noen svar tilbys bare når spilleren har nok gull.

Senere trinn leser hva som ble valgt. Avslutningen kan for eksempel være ulik avhengig av hvor mange barmhjertige eller grusomme svar spilleren ga. Dette er mønsteret «forgren, spor, utbetal»: valget setter en teller, og noe senere sjekker den.

Tallene bak historien er vanlige tellere (se *Tellere og sporing*). Veiviseren viser dem med navn, som «Nåde» eller «Spor funnet», mens selve tellerne får id-er som starter med kartnavnet og historienavnet ditt.

## Teksten

Hver tekstlinje kan redigeres i forhåndsvisningen før noe legges til. **En annen** gir en annen versjon av én linje, og **Skriv alt på nytt** gjør om hele historien. Rediger fritt: teksten havner som lokaliseringstokens, så du kan også endre den senere i Lokaliseringsredigereren.

Uten noe oppsett kommer teksten fra innebygd ordlyd i fire toner (heroisk, dyster, humoristisk, mystisk). Det fungerer bra for å prøve ut en historie. Svarene er generiske per type (dristig, forsiktig, barmhjertig og så videre).

## Tekstskriveren (valgfri, skrivebordsappen)

Med en gratis nøkkel fra Google Gemini eller Groq skrives teksten slik at den passer historien din og navnene på kartet ditt, du kan skrive på hvilket som helst av spillets 16 språk, og **Jeg har min egen idé** blir tilgjengelig.

Sett den opp fra første skjermbilde i Historiebyggeren: velg en tjeneste, lim inn nøkkelen din og godta varselet. Nøkkelen lagres i operativsystemets legitimasjonslager, ikke i prosjektet.

- Teksten du genererer, og enhver historieidé du skriver inn, sendes til tjenesten du valgte. Gratisabonnementer kan bruke den til å forbedre modellene sine, så hold alt privat utenfor.
- Hvis tjenesten ikke kan nås, nøkkelen avvises eller gratisgrensen er brukt opp, brukes den innebygde teksten, og historien fungerer fortsatt.
- Velg et **Skriv på**-språk på første skjermbilde. Engelsk opprettes alltid også, slik at spillet kan falle tilbake til det; de to vises side om side. Språk du legger til er oversatte utkast: les dem gjennom før du publiserer.

> **Warning:** Maskinskrevet og maskinoversatt tekst kan være feil eller klønete. Les alltid gjennom forhåndsvisningen, særlig på språk du ikke snakker.

## Før du publiserer

- Lagre eller Publiser bygger historiens oppdrag inn i `.map`, som alle andre oppdrag.
- Dialog-id-er og tekster deles av alle kart og zip-filer i spillet. Historien setter kartnavnet ditt foran alt; problemlisten advarer om dialog-id-er som ikke starter med det.
- Test historien i spillet. To detaljer er verdt å følge med på: et trinn kan starte på turen etter at det forrige ble ferdig, og avslutningen bruker lukkingen av den siste dialogen til å gi spilleren seieren.

> **Note:** Hvis en teller endres, men aldri sjekkes, eller sjekkes, men aldri endres, sier problemlisten fra om det. Når du har redigert en historie for hånd, se der først.
