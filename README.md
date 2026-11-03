# FIRMENFEIER · Flugmodus X 405x

Interaktive Gaussian-Splat-Seite mit zwei Szenen: Der Scan baut sich als Punktwolke auf,
der Raum dahinter löst sich in schwebende Punkte auf, darüber liegt ein HUD.
Die Pfeile links und rechts (oder die Pfeiltasten) wechseln die Szene: Der Splat zerfällt in Punkte,
der nächste baut sich auf, der Titel wechselt (FIRMENFEIER ↔ DONIKA).
Drehen mit Maus oder Finger (Tastatur: A/D, ↑/↓), Zoom per Mausrad oder zwei Fingern, Verschieben mit
rechter Maustaste oder zwei Fingern. Doppelklick oder `R` setzt die Ansicht zurück.
Direktlink auf eine Szene: `…/firmenfeier/#donika`.

Reine statische Seite, kein Build-Schritt. Läuft auf GitHub Pages.

## Inhalt

| Pfad | Inhalt |
|---|---|
| `index.html` | Seite |
| `css/style.css` | Look: Hintergrund, HUD, Titel, Loader |
| `js/main.js` | Engine, Laden, Szenenwechsel, Szenen-Einstellungen (`SCENES` oben in der Datei) |
| `js/orbit.js` | Kamera-Steuerung (Maus, Touch, Pinch, Auto-Dreh) |
| `js/splat-fx.js` | Shader-Effekt: Punktwolken-Einblendung, Auflösen am Rand, Zerfall beim Szenenwechsel |
| `js/hud.js` | Kompassband, Höhenleiste, Messwerte |
| `assets/scene.sog` | Szene 1 FIRMENFEIER (16,5 MB, aus `Jungs Gruppe.ply`, 995.790 Splats, SH3) |
| `assets/donika.sog` | Szene 2 DONIKA (23,5 MB, Spirula-Training 03.11.2026, Kugel r = 6 um den Tisch, adaptiv auf 1,5 Mio. Splats reduziert, SH3) |
| `lib/playcanvas.min.mjs` | PlayCanvas Engine 2.23.3 (MIT) |
| `fonts/` | Unbounded und JetBrains Mono (beide SIL Open Font License) |
| `og-image.jpg` | Vorschaubild für Link-Vorschauen |

## Lokal ansehen

Die Seite muss über einen Webserver laufen (nicht per Doppelklick), z. B.:

```bash
python -m http.server 8000
```

Dann http://localhost:8000 öffnen. `?debug` zeigt Kamerawerte im HUD an (zum Einstellen der Startansicht).

## Auf GitHub Pages veröffentlichen

Ziel: https://leeroyscripts.github.io/firmenfeier/ (Repo `leeroyscripts/firmenfeier`). Allgemeiner Ablauf:

1. Auf github.com ein neues Repository anlegen (z. B. `firmenfeier`). Für GitHub Pages im kostenlosen
   Konto muss es **öffentlich** sein.
2. Dieses Verzeichnis hochladen:
   ```bash
   git remote add origin https://github.com/<user>/firmenfeier.git
   git push -u origin main
   ```
   (Alternativ alle Dateien im Browser per „Add file → Upload files“ hochladen; `scene.sog` liegt unter der 25-MB-Grenze.)
3. Im Repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   Branch `main`, Ordner `/ (root)`, speichern.
4. Nach ca. einer Minute ist die Seite unter `https://<user>.github.io/firmenfeier/` erreichbar.
5. Für Link-Vorschauen in `index.html` bei `og:image` die volle Adresse eintragen
   (`https://<user>.github.io/firmenfeier/og-image.jpg`).

## Anpassen

- **Startansicht, Grenzen, Auto-Dreh:** `view` der jeweiligen Szene in `SCENES` (`js/main.js`). Beide Aufnahmen
  stammen aus einem engen Blickwinkel, deshalb ist das Drehen begrenzt (Gruppe −20° … +24°, Donika −14° … +16°
  um die Startansicht); weiter seitlich zerfällt der Scan. `portraitDist` = Abstand im Hochformat.
- **Auflösen am Rand:** `fx.edge` = [Beginn m, Ende m, Stärke 0–1, Anteil Punkte, die weit draußen bleiben].
- **Szenenwechsel:** `FX.dissolve` (Tempo, Beschleunigung, Ausblendlänge, Drift, Ende) und `fx.reveal` pro Szene.
- **Weitere Szene:** PLY mit `splat-transform input.ply assets/<name>.sog` umwandeln und in `SCENES` einen Eintrag
  mit `id`, `title`, `url`, `bytes`, `splats`, `rotation`, `view`, `lift` und `fx` ergänzen. Die Pfeile laufen im Kreis.
- **Agrandir Grand Heavy statt Unbounded:** Agrandir ist eine kommerzielle Schrift (Pangram Pangram).
  Mit Web-Lizenz die Datei `AgrandirGrand-Heavy.woff2` nach `fonts/` legen und in `css/style.css`
  ein `@font-face` mit `font-family: "Agrandir Grand"; font-weight: 900;` ergänzen. `--display` nennt sie bereits zuerst.

## Hinweis

Die Seite zeigt erkennbare Personen. Eine öffentliche GitHub-Pages-Seite ist für jeden mit dem Link
erreichbar, und die Splat-Datei kann heruntergeladen werden.

## Credits

- Engine: [PlayCanvas](https://github.com/playcanvas/engine), MIT-Lizenz (`lib/LICENSE-playcanvas.txt`)
- Schriften: Unbounded, JetBrains Mono, SIL Open Font License 1.1 (`fonts/LICENSE-*.txt`)
- Splat-Kompression: [splat-transform](https://github.com/playcanvas/splat-transform) 3.9.2
