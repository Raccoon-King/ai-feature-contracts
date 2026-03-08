# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
[1-2 line description of what this feature does]

## Scope
- [In-scope item 1]
- [In-scope item 2]

## Non-Goals
- [Explicitly excluded item]

## Directories
**Allowed:** `src/components/`, `src/hooks/`, `src/services/`, `tests/`
**Restricted:** `backend/`, `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| **CREATE** | `src/hooks/use[FEATURE].ts` | New hook for feature logic |
| **CREATE** | `tests/use[FEATURE].test.ts` | Unit tests for new hook |
| **MODIFY** | `src/types.ts` | Add new interfaces |

## Dependencies
| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| **ADD** | `example-package` | `^1.0.0` | Required for feature X |
| **UPDATE** | `existing-package` | `^2.0.0` | Needs new API |

## Assets
| Action | Path | Type | Reason |
|--------|------|------|--------|
| **CREATE** | `public/icons/feature.svg` | icon | New feature icon |
| **MODIFY** | `config/settings.json` | config | Add feature settings |

## Change Summary
| Category | Create | Modify | Delete | Total |
|----------|--------|--------|--------|-------|
| Source Files | 2 | 1 | 0 | 3 |
| Test Files | 1 | 0 | 0 | 1 |
| Dependencies | 1 | 1 | 0 | 2 |
| Assets | 1 | 1 | 0 | 2 |
| **Total** | **5** | **3** | **0** | **8** |

## Security Considerations
- [ ] Input validation implemented
- [ ] No secrets in code
- [ ] Dependencies audited (`npm audit`)

## Done When
- [ ] Feature works as specified
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds
- [ ] All new dependencies approved

## Testing
- [ ] Unit tests for new code
- [ ] Integration tests if applicable
- [ ] Manual verification

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
