# DataPulse

DataPulse is a lightweight data quality and analytics platform built to demonstrate agentic software delivery with GitHub Copilot. The app lets users create datasets, inspect records, update metadata, and cleanly manage the core dataset lifecycle.

## Architecture

The project is organized as a thin two-tier application:

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: SQLite for the local demo environment
- Persistence: relational tables with SQL and JSON storage for row payloads

This is intentionally lightweight so the engineering workflow remains easy to reason about while still showing real CRUD, validation, and data management patterns.

## Implementation plan

### Phase 1 — vertical slice (current)

- Create dataset
- Store dataset metadata
- View dataset list and details
- Update dataset metadata
- Delete dataset with confirmation

### Phase 2 — data operations

- Record CRUD
- CSV import parsing
- schema profiling
- quality rules and scoring

### Phase 3 — analytics and visualization

- summaries and charts
- SQL analytics examples
- pipeline status view

### Phase 4 — polish and reliability

- validation hardening
- error handling
- documentation
- test coverage and regression checks

## Local setup

```bash
npm install
npm run dev
```

The frontend runs on http://localhost:5173 and the API runs on http://localhost:3001.

## Production build

```bash
npm run build
npm run start
```

## Testing

```bash
npm test
```

## Engineering loop

DataPulse is developed with a repeatable engineering loop:

1. **Observe** — reproduce the issue or review the user journey.
2. **Collect evidence** — inspect the browser, API response, logs, and failing test.
3. **Form a hypothesis** — identify the smallest likely root cause.
4. **Implement** — make a focused change and add a regression test when behavior changes.
5. **Run** — execute the narrowest relevant check first.
6. **Debug** — if a check fails, use the new evidence to refine the hypothesis instead of rewriting blindly.
7. **Verify** — run the full project gate with `npm run verify`.
8. **Improve** — document the fix and note the next highest-value improvement.

The `verify` command runs linting, TypeScript checks, tests, and production builds in sequence.

## API summary

- GET /api/health
- GET /api/datasets
- POST /api/datasets
- POST /api/datasets/import-csv
- GET /api/datasets/:id
- PUT /api/datasets/:id
- DELETE /api/datasets/:id

This project is intentionally scoped to the first working vertical slice before broadening into the larger data quality platform described in the product brief.
