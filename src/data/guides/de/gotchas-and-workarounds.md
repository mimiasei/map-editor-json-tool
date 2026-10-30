---
title: Stolperfallen & Workarounds
category: troubleshooting
order: 2
---

## Die Aufgabendatei ist Pflicht — auch für Interaktionsauslöser

Damit **irgendeine** Skriptlogik auf einer Karte funktioniert, muss im selben Ordner wie `map_name.map` eine Aufgabendatei `map_name.json` existieren, die mindestens einen leeren Block `"quests"` enthält. Ohne sie bricht schon der einfachste Interaktionsauslöser, der über „Actions Before/After“ des Karteneditors an Objekte gehängt wurde, das Laden der Karte komplett ab.

**Aufgaben laufen aus der `.map`, nicht aus der `.json`.** Das Spiel liest Aufgaben aus Block 4 in der `.map` (markiert durch das Header-Byte nach dem Versions-String, `0d 00` statt `05 00`) und ignoriert die Begleit-`.json` während des Spielens. Dieses Werkzeug bettet die Aufgaben beim Speichern und beim Veröffentlichen in die `.map` ein; eine von Hand bearbeitete `.json` bewirkt nichts, bis die Karte erneut gespeichert wird. Zwei weitere Dinge, die dazu führen, dass eine Karte ihre Aufgaben stillschweigend überspringt oder aus der Liste verschwindet: zwei `.map`-Dateien mit demselben Header-Hash (eine kopierte Karte braucht einen neuen Hash) und `.zip`-Dateien in StreamingAssets, deren Dialog-IDs oder Text-Tokens solche aus Core.zip oder einem anderen ZIP wiederholen (sie überschreiben sich gegenseitig, halten Sie sie daher pro Karte eindeutig).

> **Warning:** Erstellen und exportieren Sie Ihre Aufgabendatei immer, bevor Sie Skripting im Spiel testen, auch wenn sie nur ein leeres Aufgaben-Array enthält.

## Eine fehlerhafte Aktion bricht den ganzen Auslöser

Ist irgendeine Aktion eines Auslösers falsch geschrieben — falscher Typname, falsche Parameterzahl, ungültige SID —, feuert diese Aktion nicht. **Keine andere Aktion desselben Auslösers feuert dann ebenfalls.** Die gesamte Aktionsliste schlägt stillschweigend fehl.

> **Warning:** Wenn ein Auslöser scheinbar gar nichts tut, prüfen Sie jede Aktion auf Tippfehler im Typnamen und nicht passende Parameterzahlen. Testen Sie zuerst mit einer einfachen Aktion `Print`, um zu bestätigen, dass der Auslöser feuert.

## Aktionen werden sofort ausgeführt — nicht nacheinander in Echtzeit

Alle Aktionen feuern nacheinander, ohne auf den Abschluss der vorherigen zu warten (außer Dialoge, die die Ausführung anhalten). Wenn Sie also zwei Aktionen verketten, die beide sichtbare Bewegung oder Animation erzeugen, kann das unerwartete Ergebnisse liefern — nur das Ergebnis der letzten ist sichtbar.

Zum Beispiel lassen zwei `MoveCamera`-Aktionen hintereinander die Kamera sofort zum zweiten Ziel springen, da die erste Bewegung augenblicklich verdrängt wird.

> **Note:** Wenn Sie nacheinander zeitgesteuerte Aktionen brauchen (animieren, pausieren, dann erneut animieren), nutzen Sie Dialogaktionen als Pausen dazwischen oder gestalten Sie den Auslöser als mehrere Teilaufgabenschritte um.

## Das Break-Flag bei Aktionen

Jede Aktion kann das optionale Feld `"break": true` tragen. Wird eine Aktion mit `break: true` ausgeführt, werden alle übrigen Aktionen des Auslösers übersprungen. Nutzen Sie dies für bedingte Verzweigung — kombinieren Sie es mit Dialogaktionen (`DialogIfHero`, `DialogIfRes`, `DialogIfCounter`), die nur für bestimmte Spieler oder Zustände laufen, und setzen Sie dann `break: true` bei diesen Aktionen, um die Ausführung für diesen Spieler zu stoppen, bevor die gemeinsamen Aktionen laufen.

Beispiel: Zeigen Sie einen besonderen Dialog für Held A (mit `break: true`); die darunter stehenden Aktionen laufen dann nur für andere Helden.

## UND-Logik feuert bei „beide haben einmal gefeuert“ — nicht bei „beide gleichzeitig wahr“

Da Bedingungen einmalige Listener sind, feuert `conditionsLogic: "And"`, sobald jede einzelne Bedingung einmal ausgelöst hat — selbst wenn sie nie gleichzeitig eintraten. Feuert eine Bedingung und wird dann „rückgängig gemacht“ (z. B. der Spieler erobert ein Gebäude und verliert es wieder), feuert der Auslöser trotzdem, wenn später die zweite Bedingung auslöst, weil die erste bereits gefeuert hat.

Um die Bedingungen zurückzusetzen und neu zu beginnen, verwenden Sie `TriggerClear` (setzt den aktuellen Auslöser zurück) oder `TriggerClearCustom` (setzt einen bestimmten Auslöser per Index in einer anderen Teilaufgabe zurück).

## Auslöser feuern in Deklarationsreihenfolge

Innerhalb einer Teilaufgabe werden Auslöser in der Reihenfolge ausgewertet, in der sie deklariert sind. Feuern zwei Auslöser im selben Tick, feuert der erste zuerst. Beachten Sie dies, wenn die Aktion eines Auslösers die Bedingung eines anderen freischaltet.

> **Note:** Auch Aktionen innerhalb eines Auslösers werden der Reihe nach ausgeführt. Ein `CounterSet` in Aktion 1 ist für die Prüfung einer `Counter`-Bedingung im nächsten Auslöser im selben Tick sichtbar.

## Wiederholende Auslöser und Endlosschleifen

Ein Auslöser mit `repeat: true` und ohne Bedingungen (oder mit immer wahren Bedingungen) feuert bei jedem Tick. Das ist mit ziemlicher Sicherheit ein Fehler.

**Sichern Sie wiederholende Auslöser immer ab** — mit mindestens einer Bedingung, die nach der gewünschten Anzahl von Auslösungen falsch wird, typischerweise eine Zählerprüfung.

> **Warning:** Ein endlos feuernder Auslöser kann eine Karte unspielbar machen. Verwenden Sie Zählersicherungen bei allen wiederholenden Auslösern.

## SquadKill feuert auf die Entitäts-SID des Trupps, nicht auf den Einheitentyp

Wenn Sie im Karteneditor einen neutralen Stapel platzieren, weisen Sie ihm eine Entitäts-SID zu (z. B. `goblin_patrol_1`). Die Bedingung `SquadKill` erwartet **diese Entitäts-SID**, nicht die SID des Einheitentyps (z. B. `goblin`).

Wenn Sie Kills aller Goblins verfolgen wollen, verwenden Sie stattdessen `UnitKill` mit der SID des Einheitentyps.

> **Note:** Entitäts-SIDs werden im Eigenschaftenbereich des Karteneditors für jedes platzierte Objekt oder jeden Trupp festgelegt.

## Dialogaktionen schlagen stillschweigend fehl, wenn der Dialog fehlt

Verweist eine Aktion `Dialog` auf eine Dialog-ID, die im Karten-ZIP nicht existiert, überspringt das Spiel sie stillschweigend — kein Fehler, keine Meldung. Die übrigen Aktionen des Auslösers feuern weiterhin.

Prüfen Sie immer, dass jede referenzierte Dialog-ID in Ihrem exportierten ZIP existiert.

> **Warning:** Testen Sie alle Dialog-Aktionen im Spiel, bevor Sie Ihre Karte ausliefern.

## Lokalisierungstokens müssen in customMaps.json stehen

Aufgabennamen, Beschreibungen, Dialogtexte und alle anderen für den Spieler sichtbaren Zeichenketten müssen Einträge in der `customMaps.json` innerhalb Ihres Karten-ZIPs haben.

Dieser Editor verwaltet Lokalisierungstokens für Sie. Nutzen Sie die Schaltfläche **Lokalisierung** in der Werkzeugleiste, um Tokens hinzuzufügen und zu bearbeiten. Sie werden beim **ZIP-Export** automatisch aufgenommen.

> **Note:** Fehlt eine Lokalisierungs-SID in der customMaps.json, zeigt das Spiel dem Spieler die rohe SID-Zeichenkette an (z. B. „kill_quest_name“ statt „Hunt the Dragon“).

## SubQuestActivate und NextSubQuest

Beide Aktionen rücken Teilaufgaben vor, funktionieren aber unterschiedlich:

- `NextSubQuest` aktiviert die nächste Teilaufgabe der Reihe nach (per Index oder SID) — für linearen Fortschritt
- `SubQuestActivate` aktiviert jede benannte Teilaufgabe in jeder Aufgabe — für Verzweigung oder aufgabenübergreifende Interaktionen

## DeleteHero löst HeroKill aus

`DeleteHero` entfernt einen Helden von der Karte und löst — wie Niederlage, Rückzug oder Aufgabe im Kampf — die Bedingung `HeroKill` aus. `DeleteHero` ist ein gültiger Weg, den Tod eines Helden für Aufgabenlogik zu simulieren, die von `HeroKill` abhängt.

## RemoveRes prüft die Verfügbarkeit nicht

`RemoveRes` entfernt Ressourcen aus dem Vorrat des Spielers. Hat der Spieler nicht genug, wird die Ressource auf 0 gesetzt — es schlägt nicht fehl und meldet keinen Fehler. Prüfen Sie die Ressourcenmengen vorher immer mit einer Bedingung `ResCounter`, wenn es auf genaue Beträge ankommt.
