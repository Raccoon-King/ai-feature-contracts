# FC: Pre-Op Summary Documentation
**ID:** FC-001 | **Status:** complete
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Document the new pre-op summary feature that displays contract summaries in a rounded box format during dev ticket creation and in pre-commit hooks.

## Scope
- Document `formatContractSummaryBox` function in tui.cjs
- Document `buildPreOpSummary` and `savePreOpSummary` functions
- Document pre-commit hook pre-op display behavior
- Update README with pre-op workflow overview
- Add usage examples

## Non-Goals
- Code changes to the pre-op feature itself
- Changes to other documentation unrelated to pre-op

## Directories
**Allowed:** `docs/`, `README.md`
**Restricted:** `lib/`, `src/`, `bin/`, `node_modules/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| **MODIFY** | `README.md` | Add pre-op feature overview |
| **CREATE** | `docs/PRE-OP-SUMMARY.md` | Detailed pre-op documentation |

## Dependencies
| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| *None* | - | - | Documentation only |

## Assets
| Action | Path | Type | Reason |
|--------|------|------|--------|
| *None* | - | - | Documentation only |

## Change Summary
| Category | Create | Modify | Delete | Total |
|----------|--------|--------|--------|-------|
| Documentation | 1 | 1 | 0 | 2 |
| **Total** | **1** | **1** | **0** | **2** |

## Security Considerations
- [x] No code changes - documentation only
- [x] No secrets in documentation

## Done When
- [x] README includes pre-op feature section
- [x] docs/PRE-OP-SUMMARY.md created with full documentation
- [x] Usage examples provided
- [x] API reference for formatContractSummaryBox documented

## Testing
- [ ] Documentation renders correctly in markdown viewers
- [ ] Examples are accurate and runnable

## Context Refs
*None required for documentation-only contract*

## AI Assistant Handoff
- Generate prompt bundle: `grabby prompt FC-001-preop-docs.fc.md`
