# ASAN-CARGOO — Accounting Application

Desktop accounting app for the **ASAN-CARGOO** transportation company, built with **Electron + Bootstrap 5 + vanilla JavaScript** and **local JSON storage**.

## Features

- **Dashboard** — invoiced / collected / outstanding / expenses / trip profit, monthly revenue-vs-expense chart, recent invoices
- **Customers** — contacts with per-customer invoiced / paid / balance owed
- **Invoices** — multi-line invoices (qty × rate), auto numbering (`INV-2025-0001`), statuses (Unpaid / Partial / Paid), record payments, printable invoice
- **Expenses** — categorized (Fuel, Maintenance, Tolls, Salaries, Rent, Insurance, Office Supplies, Other), optional vehicle link, month & category filters
- **Trips** — origin → destination, truck, driver, customer, revenue, cost, profit per trip with monthly totals
- **Fleet & Drivers** — manage trucks and driver records
- **Reports** — month selector: invoiced, collected, expenses by category, customer balances, **CSV export**

## Run it

```bash
npm install   # downloads Electron (once)
npm start     # launches the app
```

Requires Node.js 18+.

## Where is my data?

Data is saved automatically to a single JSON file:

- Windows: `%APPDATA%/asan-cargoo/asan-cargoo-data.json`
- macOS: `~/Library/Application Support/asan-cargoo/asan-cargoo-data.json`
- Linux: `~/.config/asan-cargoo/asan-cargoo-data.json`

Back up that file to back up the whole accounting system. You can also set `ASAN_DATA_FILE=/path/to/file.json` to control the location.

## Project structure

```
asan-cargoo/
├── main.js          Electron main process + JSON storage (IPC: db:load, db:save)
├── preload.js       Secure bridge (contextIsolation on, no nodeIntegration)
└── src/
    ├── index.html   Single-page UI (Bootstrap 5 sidebar layout, all views & modals)
    ├── css/style.css
    └── js/app.js    All app logic (state, rendering, calculations, CSV export)
```

## Notes

- All amounts are USD.
- Bootstrap & icons load from CDN, so the UI needs internet on first launch of each day you run it; data itself is fully local and works offline.
