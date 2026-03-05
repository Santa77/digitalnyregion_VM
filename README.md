# Voting Monitor – Digitálny región

Monitorovacia aplikácia pre hlasovanie v súťaži [digitalnyregion.sk](https://www.digitalnyregion.sk). Cron script každých 5 minút sťahuje stav hlasov z API a ukladá snapshoty. Dashboard zobrazuje aktuálne poradie projektov a vývoj hlasov v čase.

## Štruktúra súborov

```
monitor/
├── cron/
│   └── fetch.php          # Cron script – sťahuje API a ukladá snapshoty
├── data/
│   ├── snapshots/         # Timestampované JSON snapshoty (nie v gite)
│   ├── latest.json        # Posledný snapshot (nie v gite)
│   └── fetch.log          # Log fetchov (nie v gite)
├── api.php                # Backend API pre AJAX volania
├── index.html             # Dashboard
├── app.js                 # Frontend logika
└── style.css              # Dark theme styling
```

## Inštalácia

### Požiadavky

- PHP 7.4+ s `allow_url_fopen = On` (alebo cURL)
- Webserver (Apache / Nginx) alebo `php -S` pre lokálny vývoj

### Kroky

1. Skopíruj adresár `monitor/` na server do webového koreňa.

2. Over, že PHP má práva zapisovať do `data/`:
   ```bash
   chmod 755 data/
   ```

3. Spusti prvý fetch manuálne:
   ```bash
   php cron/fetch.php
   ```
   Skontroluj výstup v `data/fetch.log` a vznik `data/latest.json`.

4. Pridaj cron entry (každých 5 minút):
   ```
   */5 * * * * php /var/www/html/monitor/cron/fetch.php
   ```

5. Otvor `index.html` v browseri (cez webserver, nie priamo ako súbor – potrebuje AJAX na `api.php`).

## API

Endpoint: `api.php?action=<akcia>`

| Akcia | Popis |
|---|---|
| `latest` | Posledný snapshot (všetky projekty + metadata) |
| `regions` | Pole unikátnych regiónov |
| `history[&region=X][&hours=N]` | História hlasov zo snapshotov |

### Príklady

```
api.php?action=latest
api.php?action=regions
api.php?action=history
api.php?action=history&region=Žilinský samosprávny kraj
api.php?action=history&region=Košický samosprávny kraj&hours=24
```

### Formát `history` odpovede

```json
{
  "timestamps": ["2026-03-05T08:00:00+00:00", "..."],
  "projects": {
    "42": {
      "title": "Názov projektu",
      "region": "Žilinský samosprávny kraj",
      "city": "Žilina",
      "category": "Digitálne zručnosti",
      "votes": [120, 125, 131]
    }
  }
}
```

## API Zdroj

- URL: `https://www.digitalnyregion.sk/api/projects?limit=100`
- Formát: JSON pole projektov
- Polia: `id`, `slug`, `title`, `description`, `category`, `region`, `city`, `votesCount`, `votingEnabled`, `isActive`, `createdAt`, `updatedAt`
- Aktuálne: 25 projektov, 8 regiónov

## Dashboard

- **Bootstrap 5** – responzívny layout, dark theme
- Filter podľa regiónu (dropdown), výber sa ukladá do URL hash (zdieľateľný link)
- Top 3 projekty: gold / silver / bronze badge
- Auto-refresh každých 5 minút
- **Trend chart** – horizontálny bar chart prírastkov hlasov za posledných 10 / 50 / 100 meraní; výška sa prispôsobuje počtu zobrazených projektov; každý bar obsahuje aktuálne absolútne poradie projektu
- **Line chart** – vývoj absolútnych hlasov v čase, časové okno: 6h / 24h / 3d / všetko

## Retencia dát

Snapshoty sa nemažú. Pri dlhšej prevádzke `api.php?action=history` automaticky sampuje max 500 snapshotov (rovnomerne rozložených), takže výkon zostáva konzistentný.
