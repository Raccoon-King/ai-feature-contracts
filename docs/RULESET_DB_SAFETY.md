# RULESET_DB_SAFETY_v1

## Migration Safety

- Treat schema and migration changes as data-affecting by default.
- Contracts for data-affecting work must declare `**Data Change:** yes`.
- Contracts for data-affecting work must include a `## Data Impact` checklist.
- Refresh `.grabby/db/schema.snapshot.json` and `.grabby/db/relations.graph.json` when schema or migration files change.

## Rollback

- Record rollback notes for destructive or irreversible data changes.
- Record whether a backfill is required and how it is sequenced.
- Call out cascade delete/update behavior when foreign keys are added or changed.

## CI Enforcement

- If schema or migration files change, CI must require a data-change contract.
- If schema or migration files change, CI must require refreshed DB artifacts.
- No live DB access should be assumed unless a developer-supplied constraint explicitly allows it.

## Offline Analysis

- Prefer deterministic parsing of schema, migration, and code files.
- Do not depend on live database connectivity for discovery, lint, or audit.
