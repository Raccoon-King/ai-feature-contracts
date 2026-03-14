# FC: Release v2.3.8
**ID:** FC-2026-REL238 | **Status:** approved | **Dependency Change:** yes
CONTRACT_TYPE: RELEASE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Release v2.3.8 by promoting all development branch changes into main. Includes a security fix (undici override), documentation correction, and repo professionalization (MIT license, git best practices).

## Scope
- Bump version to `2.3.8` in `package.json` and `package-lock.json`
- Add `overrides.undici` to `package.json` to patch transitive vulnerability
- Add `LICENSE` (MIT) to the repository
- Add `CONTRIBUTING.md` and `SECURITY.md` for repo professionalization
- Fix interactive guide hyperlink in `README.md`
- Add git best-practice docs (`docs/git-best-practices.md`)

## Non-Goals
- No new features or API changes
- No changes to `lib/` source logic
- No changes to test files

## Directories
**Allowed:** `.`, `docs/`
**Restricted:** `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| **MODIFY** | `package.json` | Version bump to 2.3.8, undici override |
| **MODIFY** | `package-lock.json` | Lock file update for version bump |
| **CREATE** | `LICENSE` | MIT license |
| **CREATE** | `CONTRIBUTING.md` | Contribution guidelines |
| **CREATE** | `SECURITY.md` | Security policy |
| **MODIFY** | `README.md` | Fix interactive guide link |
| **CREATE** | `docs/git-best-practices.md` | Git workflow documentation |

## Dependencies
| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| **OVERRIDE** | `undici` | `^7.24.0` | Patch transitive vulnerability via npm overrides |

## Change Summary
| Category | Create | Modify | Delete | Total |
|----------|--------|--------|--------|-------|
| Source Files | 0 | 2 | 0 | 2 |
| Docs / Config | 4 | 1 | 0 | 5 |
| Dependencies | 0 | 0 | 0 | 0 |
| **Total** | **4** | **3** | **0** | **7** |

## Security Considerations
- [x] `undici` overridden to patched version — resolves transitive vulnerability
- [x] No secrets in code
- [x] `npm audit` passes with no high/critical vulnerabilities

## Done When
- [x] Version is `2.3.8` in `package.json`
- [x] `overrides.undici` present in `package.json`
- [x] `LICENSE` file present (MIT)
- [x] All existing tests pass
- [x] `npm audit --audit-level=high` passes

## Testing
- [x] Existing test suite passes
- [x] `npm audit --audit-level=high` passes (0 vulnerabilities)

## Dependency Impact
- [x] `undici` override is a security patch for a transitive dependency — not a direct dependency addition
- [x] No new direct runtime dependencies introduced
- [x] `npm audit --audit-level=high` passes (0 vulnerabilities)
- [x] No banned packages (`moment`, `lodash`, `jquery`) introduced

## Context Refs
- ARCH: release-promotion@v1
- ENV: node-20@v1
