---
title: Ihre erste Aufgabe erstellen
category: getting-started
order: 2
---

## Was wir bauen

Eine einfache Aufgabe: Der Spieler muss einen bestimmten neutralen Trupp besiegen. Danach erhält er Gold und die Aufgabe wird abgeschlossen.

Sie können die Vorlage **Simple Kill Quest** (Datei → Neu aus Vorlage) verwenden, um eine fertige Version dieses Musters zu laden.

## Schritt 1: Einen Zähler hinzufügen

Öffnen Sie den Reiter **Zähler** und fügen Sie einen neuen Zähler hinzu. Geben Sie ihm eine aussagekräftige SID wie `quest_target_killed`. Setzen Sie seinen Anfangswert auf `0`.

> **Note:** Der Karteneditor zeigt keine Zähler an — sie existieren nur in der JSON. Das Spiel liest und verfolgt sie zur Laufzeit korrekt.

## Schritt 2: Die Aufgabe erstellen

Klicken Sie im Reiter **Aufgaben** auf **Aufgabe hinzufügen**. Legen Sie fest:
- `sid` — eine eindeutige Kennung, z. B. `kill_quest`
- `name` — Lokalisierungs-SID für den Aufgabentitel, z. B. `kill_quest_name`
- `description` — Lokalisierungs-SID für die Beschreibung, z. B. `kill_quest_desc`

Fügen Sie die Lokalisierungstokens im Dialog **Lokalisierung** hinzu (Werkzeugleiste → Schaltfläche Lokalisierung).

## Schritt 3: Eine Teilaufgabe hinzufügen

Fügen Sie innerhalb der Aufgabe eine **Teilaufgabe** hinzu. Sie stellt die Stufe „Ziel töten“ dar. Geben Sie ihr eine SID wie `kill_quest_1`.

## Schritt 4: Einen Auslöser hinzufügen

Fügen Sie innerhalb der Teilaufgabe einen **Auslöser** hinzu. Dieser Auslöser wartet auf den Kill und führt die Abschlussaktionen aus.

## Schritt 5: Die SquadKill-Bedingung hinzufügen

Fügen Sie bei den **Bedingungen** des Auslösers eine Bedingung **Squad Defeated** hinzu. Setzen Sie die Squad-ID auf die Entitäts-SID, die Sie dem neutralen Stapel im Karteneditor zugewiesen haben (z. B. `E_Squad_Dragon`).

> **Note:** Die Entitäts-SID des Trupps wird im Karteneditor beim Platzieren des neutralen Stapels festgelegt — sie ist nicht der Name des Einheitentyps.

## Schritt 6: Abschlussaktionen hinzufügen

Fügen Sie bei den **Aktionen** des Auslösers hinzu:
1. `CounterSet` — setzt `quest_target_killed` auf `1`
2. `GiveRes` — gibt dem Spieler `500` Gold als Belohnung
3. `CurrentSubQuestDone` — schließt die aktuelle Teilaufgabe ab
4. `Dialog` — zeigt einen Abschlussdialog (optional, aber empfohlen)

## Schritt 7: Lokalisierung hinzufügen

Öffnen Sie den Dialog **Lokalisierung** und fügen Sie Tokens hinzu:
- `kill_quest_name` → `'Hunt the Dragon'`
- `kill_quest_desc` → `'A dragon has been terrorizing the region. Defeat it.'`

Diese Tokens landen beim Export des ZIPs in der `customMaps.json` Ihrer Karte.

## Schritt 8: Testen

Exportieren Sie die Projekt-JSON (Speichern unter), legen Sie sie in Ihrer Karte ab und laden Sie die Karte im Spiel. Den richtigen Ablauf finden Sie unter [Ihre Karte testen](guide:testing-your-map).

> **Warning:** Der Karteneditor zeigt Änderungen an Aufgaben oder Zählern NICHT visuell an. Sie müssen die Karte im Spiel laden, um zu prüfen, ob Ihre Logik funktioniert.
