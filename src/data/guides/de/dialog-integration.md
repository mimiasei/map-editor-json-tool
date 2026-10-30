---
title: Dialoge einbinden
category: recipes
order: 1
---

## Überblick

Dialoge in HoMM:OE sind als separate JSON-Dateien in `DB/dialogs/dialogs/` definiert. Jeder Dialog hat eine eindeutige ID und enthält eine oder mehrere Folien (Text + Sprecherinfo).

Die Aktion `Dialog` spielt einen Dialog anhand seiner ID ab. Die Aktion `RandomDialog` spielt zufällig einen von mehreren Dialogen ab.

## Einen Dialog erstellen

Verwenden Sie den **Dialog-Editor** (erreichbar über das Panel Dialoge oder die Verknüpfung „Dialog bearbeiten →“ in einer Dialog-Aktion). Jede Dialogfolie hat eine Text-Lokalisierungs-SID, einen optionalen Sprecher und optionale Porträtinfos.

Alle Folientext-SIDs müssen über den Dialog **Lokalisierung** zur Lokalisierung Ihrer Karte hinzugefügt werden.

## Die Dialog-Aktion verwenden

Fügen Sie einem beliebigen Auslöser eine Aktion `Dialog` hinzu. Setzen Sie den **Dialogschlüssel** auf die exakte SID des von Ihnen erstellten Dialogs.

Der Dialog feuert, wenn die Bedingungen des Auslösers erfüllt sind.

> **Note:** Der Dialog und alle seine Lokalisierungstokens müssen in Ihrem Karten-ZIP enthalten sein. Nutzen Sie **ZIP exportieren**, um alles zusammen zu bündeln.

## Dialoge bei Objektinteraktion

Ein häufiges Muster ist, einen Dialog zu zeigen, wenn der Spieler mit einem Kartenobjekt interagiert:

1. Fügen Sie in einer Teilaufgabe einen Auslöser hinzu
2. Fügen Sie eine Bedingung `ObjectInteractionBefore` hinzu — setzen Sie die Entitäts-SID auf Ihr Kartenobjekt
3. Fügen Sie eine Aktion `Dialog` hinzu

Der Dialog feuert vor der Standardinteraktion mit dem Objekt (Schatz aufnehmen, Kampf usw.).

## Dialoge im Karten-ZIP mitliefern

Das Spiel liest Dialoge aus dem Ordner `DB/dialogs/` des Karten-ZIPs. Der Editor verwaltet diese für Sie: Wenn Sie **ZIP exportieren** verwenden, werden alle über den Dialog-Editor hinzugefügten Dialoge automatisch aufgenommen.

Legen Sie Dialogdateien nicht von Hand im ZIP ab — der Editor kümmert sich um die Struktur.

> **Warning:** Wenn Sie eine Dialog-ID referenzieren, die im ZIP nicht existiert, überspringt das Spiel sie stillschweigend ohne Fehler. Testen Sie Dialogauslöser immer im Spiel.
