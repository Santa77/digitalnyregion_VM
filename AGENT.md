# AGENT.md – Voting Monitor

## Projekt

PHP + vanilla JS aplikácia na monitorovanie hlasov zo súťaže digitalnyregion.sk.
Bez frameworku, bez buildu, bez závislostí okrem CDN knižníc v HTML.

## Architektúra

```
cron/fetch.php  →  data/snapshots/*.json + data/latest.json
api.php         →  číta data/, odpovedá JSON
index.html + app.js + style.css  →  dashboard (Chart.js, vlastný CSS Grid)
```

## Kľúčové súbory

| Súbor | Účel |
|---|---|
| `cron/fetch.php` | Sťahuje API, ukladá snapshot + atomicky prepíše latest.json cez rename() |
| `api.php` | Tri akcie: `latest`, `regions`, `history` |
| `app.js` | State management, fetch, rendering kariet, grafov a modalu |
| `style.css` | Terminal Noir theme, CSS variables, light/dark mode |
| `favicon.svg` | SVG favicon (3 amber bary) |
| `docs/logo.svg` | SVG logo 512×512 pre OG metadata |

## Stav aplikácie (app.js)

```js
state = {
  region: '',        // aktívny filter regiónu (prázdny = všetky)
  hours: 0,          // časové okno pre line chart (0 = celá história)
  trendWindow: 12,   // časové okno trend chartu v snapshotoch (12=1h, 36=3h, 72=6h, 144=12h, 288=24h)
  latestData: null,
  historyData: null, // dáta pre line chart
  trendData: null,   // dáta pre trend chart (nezávislý fetch)
  chart: null,
  trendChart: null,
}
```

`projectsStore` – module-level `{}`, plnený pri každom `renderCards()`; mapuje `id → celý objekt projektu` pre detail modal.

## Dva nezávislé fetche pre grafy

`fetchHistoryChart()` a `fetchTrendData()` sú **oddelené** – history chart a trend chart majú vlastné dáta.

- `fetchHistoryChart()` – posiela `?hours=state.hours`; dáta do `state.historyData`; renderuje line chart
- `fetchTrendData()` – posiela `?hours=Math.round(state.trendWindow * 5 / 60)`; dáta do `state.trendData`; renderuje trend chart

Dôvod: ak je history zoom na 6h ale trend na 24h, trend nesmie byť limitovaný 6h subsetom.

## Trend chart – detaily

- **Časové okná**: 1h=12, 3h=36, 6h=72, 12h=144, 24h=288 snapshotov (pri 5-min intervale)
- **`buildRankMap()`** – zostaví mapu `title → poradie` z `latestData`, rešpektuje aktívny región filter
- **`rankLabelPlugin`** – Canvas API plugin; kreslí pill s `#N` vo vnútri každého baru; gold/silver/bronze pre top 3
- **`setTrendChartHeight(count)`** – `count × 36px + 48px`, min 80px
- Tooltip: `+12 hlasov  |  spolu: 847  |  poradie: #2`
- Pri zmene `trendWindow` sa volá `fetchTrendData()` (re-fetch s novým `?hours=`)

## History chart – detaily

- **Časové okná**: 1h/3h/6h/12h/24h/3d(72h)/7d(168h)/celá história(0)
- Default: `hours=0` (celá história)
- Pri zmene sa volá `fetchHistoryChart()`

## API – `api.php`

Všetky odpovede sú `Content-Type: application/json; charset=utf-8`.

- Len GET požiadavky (non-GET → 405)
- `?action=latest` – vracia full projekt objekt cez `readLatest()`
- `?action=regions` – unikátne `region` hodnoty z latest
- `?action=history` – snapshoty filtrované podľa `hours` a `region`

### Sampovanie v history

- `hours > 0` → vrátia sa **všetky** body z daného obdobia (bez sampingu)
- `hours = 0` → sampovanie na max 500 bodov pre výkon (rovnomerné)

### Validácia parametrov

- `hours`: 0–720, inak 400
- Non-GET metódy: 405
- Error hlásenia sú generické (bez interných ciest)

## Karta projektu

- Diff hlasov voči predchádzajúcemu projektu v poradí (červené číslo, Bebas Neue 1.1rem)
- Projekty s `votingEnabled: false` – trieda `card-item--disabled`: opacity 0.45, prečiarknutý názov a hlasy
- Tlačidlo DETAIL → `openModal(project)` z `projectsStore`

## Detail modal

- Obrázok sa clearuje (`img.src = ''`) pred zobrazením, načíta sa asynchrónne po `.hidden = false`
- Animácia `.modal-box` sa reštartuje cez `style.animation = 'none'` + reflow + `style.animation = ''`
- Zatvorenie: tlačidlo ×, klik na overlay, Escape

## Light / Dark mode

- CSS tokeny v `html[data-theme="dark"]` a `html[data-theme="light"]`
- Inline script v `<head>` nastavuje tému pred renderom (bez FOUC)
- Preferencia: `localStorage.vmTheme` → `prefers-color-scheme`
- `CHART_THEMES` + `applyChartTheme()` aktualizuje Chart.js bez rekreácie

## URL hash (filter persistence)

| Parameter | Popis | Default |
|---|---|---|
| `region` | Názov regiónu | (prázdny = všetky) |
| `hours` | Časové okno line chartu | 0 |
| `tw` | Okno trend chartu (snapshoty) | 12 |

Defaultné hodnoty sa do hash nepíšu (čistá URL).

## Pravidlá pre zmeny

- **Nikde nepodpisovať menom AI nástroja** – ani v kóde, dokumentácii, commit messages
- **Push robí vždy používateľ sám** – nespúšťaj `git push` bez explicitnej požiadavky
- **Nemazať snapshoty** – retencia je zámerná
- **CDN verzie sú zafixované** – Chart.js 4.4.3, chartjs-adapter-date-fns 3.0.0
- **Žiadny Bootstrap** – layout je čistý CSS Grid
- **Chart update vs. destroy** – `chart.update('none')` ak inštancia existuje; destroy len bez dát
- **Výška trend chartu je dynamická** – `setTrendChartHeight()`; nemeň na fixnú výšku v CSS
- **PHP kompatibilita** – PHP 7.4.33; bez union typov, `never`, `match`, `enum`, `fiber`
- **SSL verifikácia vypnutá** – `verify_peer: false` v `cron/fetch.php` kvôli produkcii
- **Atomický zápis latest.json** – cez `rename()` v `cron/fetch.php`

## Časté úpravy

### Zmeniť interval fetchovania
- Cron entry: `*/5 * * * *` → napr. `*/10 * * * *`
- `app.js`: konštanta `REFRESH_MS`

### Pridať nové pole z API do kariet
1. `api.php` – `history` action: pridaj pole do `$projectsMap[$id]`
2. `app.js` – `renderCards()`: pridaj HTML do template literal

### Pridať nový filter (napr. kategória)
- Vzor podľa `region` filtra: nový `state.category`, nový dropdown, filter v `getFilteredProjects()` a `api.php?action=history&category=X`

## Testovanie

```bash
# Manuálny fetch
php cron/fetch.php
cat data/fetch.log

# Overiť API
curl "http://localhost/monitor/api.php?action=latest"
curl "http://localhost/monitor/api.php?action=history&hours=6"

# Lokálny server
php -S localhost:8080 -t /path/to/monitor/
```
