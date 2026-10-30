---
title: Geschichtsbauer
category: recipes
order: 3
---

## Was er tut

Die Schaltfläche **Geschichte** in der Werkzeugleiste fügt Ihrer Karte eine vollständige, zusammenhängende Geschichte hinzu: eine Kette von Aufgaben, die Dialoge, die sie erzählen, und die Zähler, die sich merken, was der Spieler gewählt hat. Sie zeigen auf Orte Ihrer Karte und wählen einen Ton; der Text wird für Sie geschrieben. Alles, was dabei entsteht, sind gewöhnliche Aufgaben, Zähler und Dialoge, sodass Sie alles danach öffnen und ändern können wie etwas, das Sie selbst geschrieben haben.

Ein Rückgängig entfernt die Aufgaben und Zähler der Geschichte. Die Dialoge und ihre Texte bleiben im Projekt; entfernen Sie diese aus der Dialogliste, wenn Sie sie nicht möchten.

> **Note:** Öffnen Sie zuerst Ihre `.map`, damit die Geschichte die Städte, Armeen und Objekte anbieten kann, die auf Ihrer Karte liegen. Geben Sie der Karte in den Karteneinstellungen einen Namen, denn jede ID, die die Geschichte erzeugt, beginnt damit.

## Eine Geschichte wählen

Wählen Sie eine der fertigen Geschichten, **Eigene bauen** oder **Ich habe eine eigene Idee**.

- **Fertige Geschichten** enthalten jeweils mindestens eine echte Entscheidung für den Spieler: *Das verfluchte Moor* (Hinweisen folgen, dann jemanden beschuldigen), *Die lange Belagerung* (vorbereiten, dann eine Anzahl Tage überstehen) und *Der Grenzeid* (eine Stadt einnehmen, entscheiden, wie man ihre Bewohner behandelt, dann einem Kriegsherrn gegenübertreten).
- **Eigene bauen** lässt Sie Schritte stapeln: eine Einleitung, Orte besuchen, eine Stadt erobern, eine Armee besiegen, Gold sammeln, eine Anzahl Tage abwarten, eine Belohnung und Spielerentscheidungen. Ein Ende wird für Sie hinzugefügt und reagiert auf die Entscheidungen.
- **Ich habe eine eigene Idee** macht aus ein paar eigenen Sätzen in beliebiger Sprache dieselbe Art von Geschichte. Sie erfordert den Textschreiber (siehe unten).

## Auf Ihre Karte zeigen

Jede Geschichte verlangt ein paar Dinge von Ihrer Karte, etwa eine zu erobernde Stadt oder Orte zum Besuchen. Der Assistent füllt Vorschläge aus, die Sie einfach übernehmen können. Um einen zu ändern, suchen Sie nach Namen oder klicken Sie mit der Pin-Schaltfläche darauf im Kartenraster.

> **Note:** Nur Objekte, Städte und Armeen, die auf der Karte einen Namen (eine Entitäts-ID) haben, können gewählt werden. Benennen Sie sie zuerst im Karteneditor des Spiels.

## Spielerentscheidungen

Eine Entscheidung ist ein Dialog mit zwei bis vier Antworten. Jede Antwort kann einen Zähler ändern, Gold geben oder nehmen und zeigt einen eigenen Folgetext. Manche Antworten werden nur angeboten, wenn der Spieler genug Gold hat.

Spätere Schritte lesen, was gewählt wurde. Das Ende kann sich zum Beispiel unterscheiden, je nachdem, wie viele gnädige oder grausame Antworten der Spieler gegeben hat. Das ist das Muster „verzweigen, verfolgen, auszahlen“: Die Entscheidung setzt einen Zähler, und etwas später prüft ihn.

Die Zahlen hinter der Geschichte sind gewöhnliche Zähler (siehe *Zähler und Fortschrittsverfolgung*). Der Assistent zeigt sie mit Namen wie „Mercy“ oder „Clues found“, während die Zähler selbst IDs erhalten, die mit Ihrem Karten- und Geschichtsnamen beginnen.

## Der Text

Jede Textzeile kann in der Vorschau bearbeitet werden, bevor etwas hinzugefügt wird. **Weitere** liefert eine andere Version einer Zeile, und **Alles neu schreiben** erstellt die ganze Geschichte neu. Bearbeiten Sie nach Belieben: Der Text landet als Lokalisierungstokens, sodass Sie ihn später auch im Lokalisierungseditor ändern können.

Ohne jede Einrichtung stammt der Text aus eingebauten Formulierungen in vier Tönen (heroisch, düster, humorvoll, geheimnisvoll). Das eignet sich gut, um eine Geschichte auszuprobieren. Antworten sind je Art allgemein gehalten (kühn, vorsichtig, gnädig usw.).

## Der Textschreiber (optional, Desktop-App)

Mit einem kostenlosen Schlüssel von Google Gemini oder Groq wird der Text passend zu Ihrer Geschichte und den Namen Ihrer Karte geschrieben, Sie können in jeder der 16 Sprachen des Spiels schreiben, und **Ich habe eine eigene Idee** wird verfügbar.

Richten Sie ihn auf dem ersten Bildschirm des Geschichtsbauers ein: Wählen Sie einen Dienst, fügen Sie Ihren Schlüssel ein und bestätigen Sie den Hinweis. Der Schlüssel wird im Anmeldeinformationsspeicher Ihres Betriebssystems abgelegt, nicht im Projekt.

- Der Text, den Sie generieren, und jede eingegebene Geschichtsidee werden an den gewählten Dienst gesendet. Kostenlose Tarife dürfen ihn eventuell zur Verbesserung ihrer Modelle verwenden, halten Sie also Privates heraus.
- Ist der Dienst nicht erreichbar, wird der Schlüssel abgelehnt oder ist das kostenlose Limit aufgebraucht, wird der eingebaute Text verwendet, und die Geschichte funktioniert trotzdem.
- Wählen Sie auf dem ersten Bildschirm eine Sprache unter **Schreiben in**. Englisch wird immer ebenfalls erstellt, damit das Spiel darauf zurückfallen kann; beide werden nebeneinander angezeigt. Hinzugefügte Sprachen sind übersetzte Entwürfe: Lesen Sie sie vor dem Veröffentlichen durch.

> **Warning:** Maschinell geschriebener und übersetzter Text kann falsch oder holprig sein. Lesen Sie die Vorschau immer durch, besonders in Sprachen, die Sie nicht sprechen.

## Vor dem Veröffentlichen

- Speichern oder Veröffentlichen bettet die Aufgaben der Geschichte wie alle anderen Aufgaben in die `.map` ein.
- Dialog-IDs und -Texte werden von jeder Karte und jedem ZIP im Spiel gemeinsam genutzt. Die Geschichte stellt allem Ihren Kartennamen voran; die Problemliste warnt vor Dialog-IDs, die nicht damit beginnen.
- Testen Sie die Geschichte im Spiel. Zwei Details sind beobachtenswert: Ein Schritt kann in dem Zug beginnen, der auf den Abschluss des vorherigen folgt, und das Ende nutzt das Schließen des letzten Dialogs, um dem Spieler den Sieg zu geben.

> **Note:** Wird ein Zähler geändert, aber nie geprüft, oder geprüft, aber nie geändert, sagt die Problemliste das. Sehen Sie nach dem Bearbeiten einer Geschichte von Hand zuerst dort nach.
