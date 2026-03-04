# RULESET_FE_DEPS_v1

## Dependency Policy
- Derive FE dependency state from `package.json`, workspace manifests, and lockfiles only.
- Prefer pinned or bounded versions; avoid `*` and `latest` unless explicitly approved.
- Refresh `.grabby/fe/deps.snapshot.json` when manifests or lockfiles change.

## Upgrade Strategy
- Treat framework, router, state, build-tool, and API-client libraries as critical dependencies.
- Record upgrade intent, compatibility notes, and rollback path for critical dependency changes.
- Use lockfile-backed inventories to keep CI and local state aligned.

## Governance
- Dependency changes require an explicit contract classification and updated FE snapshot artifacts.
- When new libraries are introduced, document why existing libraries are insufficient.
- Keep repo bloat low by storing generated dependency inventories under `.grabby/fe/`.
