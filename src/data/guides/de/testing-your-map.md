---
title: Ihre Karte testen
category: troubleshooting
order: 1
---

## Der Karteneditor spiegelt JSON-Änderungen nicht wider

Das ist das Wichtigste, das Sie verstehen müssen: **Änderungen, die Sie in diesem Editor vornehmen — Aufgabenlogik, Zähler, Auslöser — sind im Karteneditor von HoMM:OE unsichtbar.** Der Karteneditor zeigt nur die visuelle Ebene (Gelände, Objekte, Helden auf der Karte).

Ihre JSON-Änderungen werden zur Laufzeit von der **Spiel-Engine** gelesen, nicht vom Karteneditor.

> **Warning:** Öffnen Sie Ihre gespeicherte Kartendatei nicht im Karteneditor von HoMM:OE in der Erwartung, die Aufgabenlogik zu sehen. Sie sehen nur die visuelle Ebene. Das Spiel liest die JSON zur Laufzeit korrekt.

## Der Testablauf

Der richtige Ablauf zum Testen der Aufgabenlogik:

1. Nehmen Sie Ihre Änderungen in diesem Editor vor
2. **Speichern unter** (oder Exportieren), um die aktualisierte JSON-Datei zu erhalten
3. Ersetzen Sie die Szenario-JSON in Ihrer Kartendatei (oder legen Sie sie dort ab, wo das Spiel sie erwartet)
4. Laden Sie die Karte in HoMM:OE
5. Testen Sie das betreffende Szenario im Spiel
6. Wiederholen Sie den Vorgang

## Die Szenario-JSON in einer Karte finden

Eine `.homm`-Kartendatei ist ein ZIP. Entpacken Sie es und suchen Sie die `scenario.json` (oder eine ähnlich benannte Datei) im Stamm- oder `DB/`-Ordner. Ersetzen Sie sie durch Ihre aktualisierte JSON und packen Sie das Archiv dann erneut als ZIP.

> **Note:** Bewahren Sie eine Sicherung Ihrer ursprünglichen Karte auf, bevor Sie Dateien ersetzen.

## Zuerst validieren

Klicken Sie vor dem Testen im Spiel in der Werkzeugleiste auf **Validieren**. Der Validator erkennt:

- Fehlende Lokalisierungstokens
- Zählerverweise, die nicht zu deklarierten Zählern passen
- Verweise auf Aufgaben-/Teilaufgaben-SIDs, die nicht existieren
- Leere Pflichtparameter

Beheben Sie alle Fehler vor dem Testen. Warnungen sind nur informativ — das Spiel läuft möglicherweise trotzdem korrekt.

## Tipps für schnelle Iteration

- Nutzen Sie `CounterSet`, um den Aufgabenstand in einem Testauslöser vorzuspulen (z. B. `quest_stage` in Zug 1 auf 5 setzen, um die Logik des späten Spiels zu testen)
- Nutzen Sie `SpawnHero`, um einen bestimmten Helden zu platzieren, wenn Sie Bedingungen testen, die einen vorhandenen Helden erfordern
- Nutzen Sie `RevealFogOfWar` zu Kartenbeginn mit großem Radius, um beim Testen alles zu sehen
