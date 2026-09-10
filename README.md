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

### Phase 2B — bounded agentic analytics (current)

- A read-only SQL Agent executes only one validated `SELECT`/`WITH` statement against a grounded `dataset` table. Queries are capped at 2,000 characters, 500 rows, and a one-second execution budget; DDL, DML, comments, system tables, and cross joins are rejected.
- Analytical requests follow the deterministic Data Analyst → SQL → Verifier path. Visualization specs are created only from verified SQL rows and include the executed SQL in the run details.
- Data-changing requests create preview-only, expiring mutation proposals. Approval checks the dataset revision and content hash, executes idempotently inside a transaction, records before-values in an audit log, and supports safe rollback when the dataset has not changed.
- Orchestration is bounded and treats prompts and dataset values as untrusted content. No external LLM or arbitrary model-generated SQL is executed.

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

### Vercel deployment

The repository includes a Vercel configuration that builds the Vite client from the workspace root and exposes the existing Express API through `/api/*`. Set the Vercel project **Root Directory** to the repository root, leave the install command empty so workspace dependencies are installed from the root `package.json`, and deploy with:

```bash
vercel --prod
```

The local SQLite database is suitable for development and demos. Vercel serverless storage is ephemeral, so production deployments should move dataset and mutation persistence to a managed database before relying on data surviving function restarts.

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
- GET /api/datasets/:id/quality
- PUT /api/datasets/:id/records/:recordIndex
- PUT /api/datasets/:id
- DELETE /api/datasets/:id
- POST /api/agents/run
- POST /api/agents/sql
- GET/POST /api/mutations/proposals
- POST /api/mutations/proposals/:id/approve
- POST /api/mutations/proposals/:id/rollback
- GET /api/mutations/audit

## Automatic quality report

CSV imports are analyzed immediately when the dataset details view opens. The deterministic quality engine reports:

- quality score and label
- completeness, uniqueness, validity, and consistency dimensions
- semantic missing values such as `NULL`, `N/A`, `UNKNOWN`, and `ERROR`
- exact duplicate rows and repeated identifier values
- inferred column types, unique counts, numeric averages, medians, ranges, and potential outliers
- invalid numeric values and clickable affected-row drill-down

The engine is explainable and does not modify uploaded records. Completed reports are persisted per dataset. `GET /api/datasets/:id/quality` reads the latest stored result, while `POST /api/datasets/:id/quality` runs a new deterministic analysis. Record changes mark the stored result stale instead of inventing a new score.

The Data Explorer connects findings back to the stored CSV rows. It supports search, issue filters, pagination, CSV row numbers, visible cell-level issue labels, and explicit record editing. After an edit, the previous report is marked stale and the user can explicitly run a new quality check; no values are changed automatically.

## Agent orchestration

DataPulse includes a bounded, deterministic-first orchestration slice at `POST /api/agents/run`. It accepts a natural-language request and a selected `datasetId`, classifies supported intent, routes only to scoped specialists, records activity, and verifies evidence before returning a result.

Implemented specialists:

- **Data Quality Agent** — reads the persisted quality result, ranks findings, and maps them to record indexes.
- **Data Analyst Agent** — summarizes dataset shape and explains supported deterministic evidence.
- **Verifier Agent** — checks that specialist evidence satisfies the task criteria.

The orchestrator uses a maximum of two iterations and four agents per run. Data values, filenames, and descriptions are treated as untrusted content rather than instructions. Requests that imply mutation, deletion, replacement, or merging stop at an explicit approval gate; no agent receives write tools. Unsupported intents return a bounded blocked result instead of randomly selecting an agent.
