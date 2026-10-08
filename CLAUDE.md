# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static map of Enea power outages in Poznań, live at https://enea-awarie.aramin.net/ (GitHub Pages, served from `docs/`). There is no server: a GitHub Actions job scrapes and geocodes outages, commits JSON into `docs/data/`, and each commit redeploys Pages. UI text is Polish.

README.md is partly outdated: it still mentions a single `docs/data/outages.json`, which has been replaced by per-day files (see below).

## Commands

Backend (run from the repo root — paths in `update_data.py` are relative to it):
```bash
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt
backend/venv/bin/python backend/update_data.py   # writes docs/data/* and backend/geocoding_cache.json
```

Frontend:
```bash
./run_local.sh                        # python http.server on :8000 serving docs/
cd docs && npm install && npm test    # jest + jsdom (CI uses Node 18)
cd docs && npx jest -t 'Unplanned'    # run a single test/describe by name
```
`docs/jest.config.js` restricts `testMatch` to `script.test.js`; new test files must be added there.

## Architecture

**Data pipeline (`backend/update_data.py`)**
- Uses the `enea-outages` library (same author: theundefined/enea-outages) to fetch planned and unplanned outages for region `Poznań`.
- `parse_addresses_from_description` regex-extracts street names from Enea's free-text descriptions; each street is geocoded via Nominatim (rate-limited to 1 req/s) and cached in `backend/geocoding_cache.json`. Failed lookups are cached as `null` so they are not retried.
- Output is one file per UTC day, `docs/data/outages_YYYY-MM-DD.json` (`{last_update, outages: [...]}`), plus `docs/data/master_index.json` (list of available dates, newest first).
- Merging is append-only within the day: outages are deduplicated by an MD5 `id` over times/description/address and never removed. Deciding what is still active happens in the frontend.

**Frontend (`docs/`)**
- `script.js`: Leaflet map. `categorizeOutage(outage, now, isCurrentView)` is the pure core logic (visibility, status label, layer: `unplanned` / `ongoing` / `next24h` / `other`) and is the only thing exported for jest via the `module.exports` guard at the bottom. The "Aktualne" view loads today's file and hides finished outages; date views show a historical day. `?date=YYYY-MM-DD` preselects a day. Every 60 s `refresh()` refetches `master_index.json` (rebuilding the selector but keeping the selection) and, if the newest day or "Aktualne" is selected, refetches that day's file bypassing `allDataCache`; rendering is deferred while a popup is open. Older days are treated as final and served from `allDataCache`. `groupVisibleOutages` merges outages sharing (layer, coordinates) into one marker and offsets markers of different layers at the same point.
- PWA: `manifest.webmanifest`, `icons/`, `sw.js` (network-first; the cache is only an offline fallback so outage data is never stale) and `pwa.js` (Android "Dodaj jako aplikację" button using `beforeinstallprompt`, with a menu-instructions fallback).

**Scheduling (`.github/workflows/update_outages.yml`)**
- GitHub starts `*/10` cron runs only every 4–7 h, so each run loops `update_data.py` every 10 min for ~5h40m (under the 6 h job limit). `concurrency` queues the next scheduled run to take over when the loop ends. This relies on the repo being public (free Actions minutes).
- The loop pulls with `--rebase --autostash` before each update, so code pushed to `main` is picked up while it runs. Bot commits ("Update outage data and geocoding cache") land on `main` constantly — pull before pushing.
- `ci.yml` runs the jest tests on push/PR to `main`.

## Gotchas

- Pushing changes to `.github/workflows/*` over HTTPS with the `gh` token fails (no `workflow` scope); push over SSH (`git@github.com:theundefined/enea-outages-map.git`).
- `docs/CNAME` (not the root `CNAME`) is what Pages uses for the custom domain.
