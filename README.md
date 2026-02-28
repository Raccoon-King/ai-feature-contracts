# AI Feature Contracts

Token-efficient feature contract system for AI-assisted development with Cline/Claude.

## Installation

```bash
# Global install
npm install -g ai-feature-contracts

# Or link locally for development
git clone https://github.com/yourusername/ai-feature-contracts.git
cd ai-feature-contracts
npm link
```

## Quick Start

```bash
# Initialize in your project
cd your-project
afc init

# Create a feature contract
afc create "user-authentication"

# Edit the contract
code contracts/user-authentication.fc.md

# Validate
afc validate user-authentication.fc.md

# Generate plan (Phase 1)
afc plan user-authentication.fc.md

# Approve
afc approve user-authentication.fc.md

# Execute with Cline/Claude (Phase 2)
afc execute user-authentication.fc.md

# Post-execution audit
afc audit user-authentication.fc.md
```

## Commands

| Command | Description |
|---------|-------------|
| `afc init` | Initialize in current project |
| `afc create <name>` | Create new contract |
| `afc validate <file>` | Validate contract |
| `afc plan <file>` | Generate plan (Phase 1) |
| `afc approve <file>` | Approve for execution |
| `afc execute <file>` | Show execution instructions (Phase 2) |
| `afc audit <file>` | Post-execution audit |
| `afc list` | List all contracts |

## Two-Phase Execution

### Phase 1: PLAN
- Outputs files to modify, rules, risks
- NO file edits allowed
- Must be approved before Phase 2

### Phase 2: EXECUTE
- Only modify files from approved plan
- NO scope expansion
- Follow RULESET_CORE patterns

## Contract Template

```markdown
# FC: Feature Name
**ID:** FC-xxx | **Status:** draft

## Objective
[1-2 line description]

## Scope
- [In-scope items]

## Non-Goals
- [Excluded items]

## Directories
**Allowed:** `src/components/`, `src/hooks/`
**Restricted:** `backend/`, `node_modules/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/hooks/useX.ts` | Logic |

## Done When
- [ ] Feature works
- [ ] Tests pass (80%+)
- [ ] Lint clean

## Context Refs
- ARCH_INDEX_v1 §frontend
- RULESET_CORE_v1 §hooks
```

## Token Efficiency

This system reduces token usage by:
- Compact contracts (<300 tokens)
- Reference-based context (`@context ARCH_INDEX_v1 §frontend`)
- Structured plans instead of prose
- Two-phase separation (plan vs execute)

## Reference Documents

After `afc init`, your project will have:
- `docs/ARCHITECTURE_INDEX.md` - Module map
- `docs/RULESET_CORE.md` - Coding rules
- `docs/ENV_STACK.md` - Environment config
- `docs/EXECUTION_PROTOCOL.md` - Workflow

## License

MIT
