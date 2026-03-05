# AGENT.md – Voting Monitor

## Projekt

PHP + vanilla JS aplikácia na monitorovanie hlasov zo súťaže digitalnyregion.sk.
Bez frameworku, bez buildu, bez závislostí okrem CDN knižníc v HTML.

## Architektúra

```
cron/fetch.php  →  data/snapshots/*.json + data/latest.json
api.php         →  číta data/, odpovedá JSON
index.html + app.js + style.css  →  dashboard (Chart.js, vlastný CSS)
```

## Kľúčové súbory

| Súbor | Účel |
|---|---|
| `cron/fetch.php` | Sťahuje API, ukladá snapshot + prepíše latest.json |
| `api.php` | Tri akcie: `latest`, `regions`, `history` |
| `app.js` | State management, fetch, rendering kariet a grafov |
| `style.css` | Terminal Noir theme, CSS variables, light/dark mode |
| `favicon.svg` | SVG favicon (3 amber bary) |
| `docs/logo.svg` | SVG logo 512×512 pre OG metadata |

## Stav aplikácie (app.js)

```js
state = { region: '', hours: 0, trendWindow: 10, latestData: null, historyData: null, chart: null, trendChart: null }
```

- `region` – aktívny filter regiónu (prázdny = všetky)
- `hours` – časové okno pre line chart (0 = všetko)
- `trendWindow` – počet posledných meraní pre trend chart (10 / 50 / 100)
- `historyData` – posledné dáta z `fetchHistory()`, používa sa pri zmene `trendWindow` bez nového API volania
- `chart` / `trendChart` – Chart.js inštancie (update vs. destroy+create)

## Trend chart – detaily

- **`buildRankMap()`** – zostaví mapu `title → poradie` z `latestData`, rešpektuje aktívny región filter
- **`rankLabelPlugin`** – Canvas API plugin; kreslí pill s `#N` vo vnútri každého baru; gold/silver/bronze pre top 3; `chart._ranks` + `chart._currentVotes`
- **`setTrendChartHeight(count)`** – nastavuje výšku `.chart-container--trend` dynamicky: `count × 36px + 48px`, min 80px
- Tooltip: `+12 hlasov  |  spolu: 847  |  poradie: #2`
- Pri update sa `_ranks` a `_currentVotes` aktualizujú pred `chart.update('none')`

## Light / Dark mode

- CSS tokeny v `html[data-theme="dark"]` a `html[data-theme="light"]`
- Inline script v `<head>` nastavuje tému pred renderom (bez FOUC)
- Preferencia: `localStorage.vmTheme` → `prefers-color-scheme` → light
- `CHART_THEMES` objekt + `applyChartTheme()` aktualizuje Chart.js bez rekreácie
- `rankLabelPlugin` číta tému cez `tc()` pri každom vykreslení

## URL hash (filter persistence)

Filtre sa ukladajú do URL hash, napr. `#region=Žilinský samosprávny kraj&hours=24&tw=50`.

| Parameter | Popis | Default |
|---|---|---|
| `region` | Názov regiónu | (prázdny = všetky) |
| `hours` | Časové okno line chartu | 0 (všetko) |
| `tw` | Okno trend chartu (počet meraní) | 10 |

Defaultné hodnoty sa do hash nepíšu (čistá URL).

## API – `api.php`

Všetky odpovede sú `Content-Type: application/json; charset=utf-8`.

- `?action=latest` – raw obsah `latest.json`
- `?action=regions` – extrahuje unikátne `region` hodnoty z latest
- `?action=history` – číta všetky snapshoty, max 500 (sampovanie), voliteľne filtruje podľa `region` a `hours`

## Formát snapshotu (`data/snapshots/YYYY-MM-DD_HH-MM.json`)

```json
{
  "fetchedAt": "2026-03-05T08:13:48+00:00",
  "count": 25,
  "projects": [ { "id": 1, "title": "...", "region": "...", "votesCount": 42, ... } ]
}
```

Polia projektu: `id`, `slug`, `title`, `description`, `descriptionFull`, `category`, `region`, `city`, `imageUrl`, `thumbnailUrl`, `goals`, `impact`, `votesCount`, `votingEnabled`, `isActive`, `createdAt`, `updatedAt`.

## Pravidlá pre zmeny

- **Nikde nepodpisovať menom AI nástroja** – ani v kóde, dokumentácii, commit messages ani PR
- **Nemazať snapshoty** – retencia je zámerná, žiadne TTL ani cleanup cron
- **CDN verzie sú zafixované** – Chart.js 4.4.3, chartjs-adapter-date-fns 3.0.0; nemeniť bez testovania
- **Žiadny Bootstrap** – layout je čistý CSS Grid; nepridávať Bootstrap späť
- **Chart update vs. destroy** – `renderChart()` aj `renderTrendChart()` robia `chart.update('none')` ak inštancia existuje; destroy len keď nie sú žiadne dáta
- **Trend chart nevyžaduje nový fetch** – pri zmene `trendWindow` sa rerendruje z `state.historyData`
- **Výška trend chartu je dynamická** – `setTrendChartHeight()` prepočítava pri každom renderi; nemeň `.chart-container--trend` na fixnú výšku v CSS
- **Sampovanie v history** – limit 500 snapshotov je pre výkon, nemeň bez testu s reálnymi dátami
- **PHP kompatibilita** – server beží na PHP 7.4.33; nepoužívaj union typy (`string|false`), `never` return type, `match`, `enum`, ani `fiber`
- **SSL verifikácia vypnutá** – `verify_peer: false` v `cron/fetch.php` kvôli produkcii

## Časté úpravy

### Zmeniť interval fetchovania
- Cron entry: `*/5 * * * *` → napr. `*/10 * * * *`
- `app.js`: konštanta `REFRESH_MS` (default: `5 * 60 * 1000`)

### Pridať nové pole z API do kariet
1. `api.php` – `history` action: pridaj pole do `$projectsMap[$id]`
2. `app.js` – `renderCards()`: pridaj HTML do template literal v `.card-item`

### Zmeniť maximálny počet snapshotov v histórii
- `api.php` riadok s `$maxSnapshots = 500`

### Pridať nový filter (napr. kategória)
- Vzor podľa `region` filtra: nový `state.category`, nový dropdown, filter v `getFilteredProjects()` a `api.php?action=history&category=X`

## Testovanie

```bash
# Manuálny fetch
php cron/fetch.php
cat data/fetch.log

# Overiť API (vyžaduje webserver)
curl "http://localhost/monitor/api.php?action=latest"
curl "http://localhost/monitor/api.php?action=regions"
curl "http://localhost/monitor/api.php?action=history"

# Lokálny server
php -S localhost:8080 -t /path/to/monitor/
```
