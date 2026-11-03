# FIRMENFEIER · Flugmodus X 405x

Interaktive Gaussian-Splat-Seite: Der Scan der Gruppe am Tisch baut sich als Punktwolke auf,
der Gastraum dahinter löst sich in schwebende Punkte auf, darüber liegt ein HUD.
Drehen mit Maus oder Finger, Zoom per Mausrad oder zwei Fingern, Verschieben mit rechter Maustaste
oder zwei Fingern. Doppelklick oder `R` setzt die Ansicht zurück.

Reine statische Seite, kein Build-Schritt. Läuft auf GitHub Pages.

## Inhalt

| Pfad | Inhalt |
|---|---|
| `index.html` | Seite |
| `css/style.css` | Look: Hintergrund, HUD, Titel, Loader |
| `js/main.js` | Engine, Laden, Szenen-Einstellungen (`SCENE` oben in der Datei) |
| `js/orbit.js` | Kamera-Steuerung (Maus, Touch, Pinch, Auto-Dreh) |
| `js/splat-fx.js` | Shader-Effekt: Punktwolken-Einblendung und Auflösen am Rand |
| `js/hud.js` | Kompassband, Höhenleiste, Messwerte |
| `assets/scene.sog` | Der Splat (16,5 MB, komprimiert aus `Jungs Gruppe.ply`, 995.790 Splats, SH3) |
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

- **Startansicht, Grenzen, Auto-Dreh:** `SCENE.view` in `js/main.js`. Die Aufnahme stammt aus einer Blickrichtung,
  deshalb ist das Drehen auf ca. −20° … +24° begrenzt; weiter seitlich zerfällt der Scan.
- **Auflösen am Rand:** `SCENE.fx.edge` = [Beginn m, Ende m, Stärke 0–1, Anteil Punkte, die weit draußen bleiben].
- **Anderen Splat zeigen:** PLY mit `splat-transform input.ply assets/scene.sog` umwandeln,
  `SCENE.bytes`, `SCENE.splats`, `SCENE.rotation` und die Startansicht anpassen.
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
