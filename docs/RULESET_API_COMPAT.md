# RULESET_API_COMPAT_v1

## Breaking Change Policy
- Treat removed endpoints, removed operations, removed fields, or incompatible payload shape changes as breaking.
- Breaking API changes require explicit approval in the governing contract before execute/audit can pass.
- Prefer additive changes, versioned rollout, and explicit deprecation notes over silent replacement.

## Versioning
- Keep version markers explicit in OpenAPI info blocks, GraphQL schema strategy, or service contract metadata.
- Record compatibility notes when endpoint behavior or payload shape changes.
- Refresh `.grabby/be/api.snapshot.json` whenever API source-of-truth files change.

## Deprecation
- Prefer deprecation markers before removal.
- Document migration guidance for FE callers when usage maps show affected call sites.
- Treat removed deprecated operations as still requiring compatibility review.
