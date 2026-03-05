# CLAUDE.md – Voting Monitor

## Projekt

PHP + vanilla JS aplikácia na monitorovanie hlasov zo súťaže digitalnyregion.sk.
Bez frameworku, bez buildu, bez závislostí okrem CDN knižníc v HTML.

## Architektúra

```
cron/fetch.php  →  data/snapshots/*.json + data/latest.json
api.php         →  číta data/, odpovedá JSON
index.html + app.js + style.css  →  dashboard (Bootstrap 5, Chart.js)
```

## Kľúčové súbory

| Súbor | Účel |
|---|---|
| `cron/fetch.php` | Sťahuje API, ukladá snapshot + prepíše latest.json |
| `api.php` | Tri akcie: `latest`, `regions`, `history` |
| `app.js` | State management, fetch, rendering kariet a grafu |
| `style.css` | Dark theme, CSS variables, card hover efekty |

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
- **`rankLabelPlugin`** – inline Chart.js plugin; kreslí `#N` bielym textom zarovnaným vľavo vo vnútri každého baru; ak je bar príliš úzky (< 28px), label sa preskočí; ranks sa ukladajú na `chart._ranks`
- **`setTrendChartHeight(count)`** – nastavuje výšku `.chart-container--trend` dynamicky: `count × 36px + 48px`, min 80px; CSS `transition: height 0.2s ease` zabezpečuje plynulú animáciu
- Tooltip obsahuje aj aktuálne poradie projektu: `+12 hlasov  |  poradie: #2`
- Pri update (zmena okna/regiónu) sa `_ranks` aktualizuje pred `chart.update('none')`

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

- **Nemazať snapshoty** – retencia je zámerná, žiadne TTL ani cleanup cron
- **Nesahovať do CDN odkazov** – Bootstrap 5.3.3, Chart.js 4.4.3, chartjs-adapter-date-fns 3.0.0 sú zafixované verzie
- **Chart update vs. destroy** – `renderChart()` aj `renderTrendChart()` robia `chart.update('none')` ak inštancia existuje; destroy len keď nie sú žiadne dáta
- **Trend chart nevyžaduje nový fetch** – pri zmene `trendWindow` sa rerendruje z `state.historyData`; nový `fetchHistory` sa volá len pri zmene `region` alebo `hours`
- **Výška trend chartu je dynamická** – `setTrendChartHeight()` prepočítava pri každom renderi; nemeň `.chart-container--trend` na fixnú výšku v CSS
- **Sampovanie v history** – limit 500 snapshotov je pre výkon, nemeň bez testu s reálnymi dátami
- **PHP kompatibilita** – server beží na PHP 7.4.33; nepoužívaj union typy (`string|false`), `never` return type, `match`, `enum`, ani `fiber` – všetko sú PHP 8.0+ featury

## Časté úpravy

### Zmeniť interval fetchovania
- Cron entry: `*/5 * * * *` → napr. `*/10 * * * *`
- `app.js`: konštanta `REFRESH_MS` (default: `5 * 60 * 1000`)

### Pridať nové pole z API do kariet
1. `api.php` – `history` action: pridaj pole do `$projectsMap[$id]`
2. `app.js` – `renderCards()`: pridaj HTML do template literal v `.project-card`

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
