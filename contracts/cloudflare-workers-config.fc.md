# FC: Cloudflare Workers Configuration
**ID:** FC-2026-CW01 | **Status:** complete | **Dependency Change:** yes
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Add Cloudflare Workers deployment configuration to serve the `docs/` directory as a static asset site via Wrangler, enabling automated deployment through Cloudflare Workers and Pages CI.

## Scope
- Add `wrangler.jsonc` configuration file for Cloudflare Workers asset serving
- Add `wrangler` as a devDependency for local development and deployment
- Add `deploy` and `preview` npm scripts for wrangler commands
- Add `bundleDependencies` for `chokidar`, `cli-progress`, and `yaml` to ensure correct npm publish packaging
- Update `.gitignore` to exclude wrangler runtime artifacts

## Non-Goals
- No changes to application source code in `lib/` or `bin/`
- No changes to test files or coverage requirements
- No server-side Worker logic (assets-only deployment)

## Directories
**Allowed:** `.`, `docs/`
**Restricted:** `node_modules/`, `.env*`, `lib/`, `bin/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| **CREATE** | `wrangler.jsonc` | Cloudflare Workers asset configuration |
| **MODIFY** | `package.json` | Add wrangler devDependency, deploy scripts, bundleDependencies |
| **MODIFY** | `package-lock.json` | Lock file update for wrangler dependency |
| **MODIFY** | `.gitignore` | Exclude `.wrangler/` and `.dev.vars*` runtime files |

## Dependencies
| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| **ADD** | `wrangler` | `^4.72.0` | Cloudflare Workers CLI for deploy and local preview |

## Change Summary
| Category | Create | Modify | Delete | Total |
|----------|--------|--------|--------|-------|
| Source Files | 1 | 3 | 0 | 4 |
| Test Files | 0 | 0 | 0 | 0 |
| Dependencies | 1 | 0 | 0 | 1 |
| Assets | 0 | 0 | 0 | 0 |
| **Total** | **1** | **3** | **0** | **5** |

## Security Considerations
- [x] Input validation implemented
- [x] No secrets in code (Cloudflare credentials handled via environment/dashboard)
- [x] Dependencies audited (`npm audit` — 0 vulnerabilities)

## Done When
- [x] `wrangler.jsonc` present and valid
- [x] `npm run deploy` and `npm run preview` scripts available
- [x] `.gitignore` excludes wrangler artifacts
- [x] `npm audit` passes with no high/critical vulnerabilities
- [x] All existing tests pass

## Testing
- [x] Existing test suite passes (69/69 suites, 1225 tests)
- [x] `npm audit --audit-level=high` passes (0 vulnerabilities)

## Dependency Impact
- [x] New dependency (`wrangler`) is a devDependency only — not shipped in production bundle
- [x] `bundleDependencies` addition ensures `chokidar`, `cli-progress`, `yaml` are correctly packaged on npm publish
- [x] `npm audit --audit-level=high` passes (0 vulnerabilities)
- [x] No banned packages (`moment`, `lodash`, `jquery`) introduced
- [x] Wrangler is scoped to deployment tooling only

## Context Refs
- ARCH: cloudflare-workers-assets@v1
- ENV: node-20@v1

## AI Assistant Handoff
- Contract covers bot-generated commit `8bc5264` from `cloudflare-workers-and-pages[bot]`
- All file changes are within approved scope
- No source logic changes — configuration and packaging only

## Lifecycle
When complete, run garbage collection to archive:
```bash
grabby feature gc list          # List candidates for archival
grabby feature gc archive <ID>  # Archive this contract
grabby feature gc keep <ID>     # Keep active with reason
```
See `lib/features.cjs:garbageCollectCompletedStories()` for batch archival logic.
