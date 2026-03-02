# Grabby

CLI-first orchestration for AI-assisted development with feature contracts, persona-led workflows, and repo-local guidance.

## Installation

```bash
git clone https://github.com/Raccoon-King/ai-feature-contracts.git
cd ai-feature-contracts
npm install
npm link
```

## Quick Start

```bash
# Initialize in your project
cd your-project
grabby init

# Let Grabby interview you and prefill a contract
grabby task "create a unit test"

# Or run the full Archie -> Val -> Sage -> Dev -> Iris handoff
grabby orchestrate "fix login redirect bug"

# Or create a contract directly
grabby create "fix login redirect bug"

# Validate
grabby validate login-redirect-bug.fc.md

# Generate plan and backlog
grabby plan login-redirect-bug.fc.md
grabby backlog login-redirect-bug.fc.md

# Render an LLM-ready prompt bundle
grabby prompt login-redirect-bug.fc.md

# Approve and execute
grabby approve login-redirect-bug.fc.md
grabby execute login-redirect-bug.fc.md

# Inspect CI/session artifacts
grabby session login-redirect-bug.fc.md --check
grabby session --check-all

# Post-execution audit
grabby audit login-redirect-bug.fc.md
```

## Commands

| Command | Description |
|---------|-------------|
| `grabby init` | Initialize in current project |
| `grabby create <request>` | Create a contract and infer a template from plain language when possible |
| `grabby task <request>` | Interview-driven task breakdown with persona selection |
| `grabby orchestrate <request>` | Full persona handoff in one CLI session |
| `grabby validate <file>` | Validate contract |
| `grabby plan <file>` | Generate plan (Phase 1) |
| `grabby backlog <file>` | Generate Agile epic/task/subtask backlog |
| `grabby prompt <file>` | Render an LLM instruction bundle |
| `grabby session <file>` | Inspect, check, or regenerate a session artifact |
| `grabby session --check-all` | Validate all session artifacts under `contracts/` for CI |
| `grabby approve <file>` | Approve for execution |
| `grabby start <file> [--type feat\|fix\|chore]` | Create a branch from contract ID/title and write `**Branch:**` |
| `grabby pr-template <file>` | Print a PR/MR title + body template from contract metadata |
| `grabby context:lint` | Validate docs/context-index.yaml file references, sections, and token budgets |
| `grabby policy:check` | Enforce optional contract-required policy from `.grabby/config.json` (CI-focused) |
| `grabby execute <file>` | Show execution instructions (Phase 2) |
| `grabby audit <file>` | Post-execution audit |
| `grabby list` | List all contracts |
| `grabby quick` | Create or implement quick specs |
| `grabby agent <name>` | Load an agent and run its menu/workflows |
| `grabby workflow <name>` | View workflow details directly |
| `grabby party` | Show the full multi-agent handoff flow |
| `grabby resume` | List saved workflow progress |
| `grabby ruleset create [goal]` | Build rulesets from existing project files |

## Persona Workflow

Grabby uses BMAD-style personalities in the CLI:
- `Archie`: contract shaping and clarification
- `Val`: contract validation and risk checks
- `Sage`: planning and backlog decomposition
- `Dev`: execution handoff preparation
- `Iris`: audit preparation and verification
- `Flash`: quick bounded work
- `Conductor`: orchestrates the full handoff

## What `grabby init` Creates

`grabby init` prepares the current repo with:
- `contracts/`
- `contracts/README.md`
- `.grabby/config.json`
- `.grabby/governance.lock`
- `.grabbyignore`
- `docs/ARCHITECTURE_INDEX.md`
- `docs/RULESET_CORE.md`
- `docs/ENV_STACK.md`
- `docs/EXECUTION_PROTOCOL.md`

## Ticket Key Awareness

Grabby supports work-item IDs in the form `KEY-123` (for example `FC-123`, `TT-123`, `JIRA-123`).

- ID normalization uppercases the key prefix (`tt-123` -> `TT-123`).
- Canonical ID resolution order: `**ID:**` in contract content, then filename, then Jira issue key on import.
- Contract/plan/audit artifacts should use canonical ID filenames:
  - `contracts/<ID>.fc.md`
  - `contracts/<ID>.plan.yaml`
  - `contracts/<ID>.audit.md`
  - `.grabby/metrics/<ID>.metrics.json`
- `grabby validate`, `grabby plan`, `grabby approve`, and `grabby execute` fail on ID/filename mismatches with an actionable rename/edit message.
- `grabby start <contract-file>` creates branches as `<type>/<ID>-<slug>` where slug is lowercased and limited to 8 words.
- `grabby pr-template <contract-file>` prints `Title: <ID>: <Title>` with contract/plan/audit and Done-When context.


## Governance Lock + Policy

- `grabby init` creates `.grabby/governance.lock` and stamps the active CLI version.
- `grabby validate` warns when the local CLI version differs from `governance.lock` (no automatic upgrade).
- Optional CI gate in `.grabby/config.json`:

```json
{
  "contractRequired": {
    "fileCountThreshold": 10,
    "restrictedPaths": ["src/core", "migrations"],
    "alwaysRequireTypes": ["architectural_change"]
  }
}
```

- `grabby policy:check` inspects staged git diff and exits non-zero when policy triggers but no contract exists.

## Context Index Hardening

- `grabby context:lint` validates:
  - referenced files exist
  - `## <Section>` headings exist
  - token budget values are numeric
- context resolution errors now include file + section details and suggestion hints for nearby section names.

## Generated Artifacts

`grabby task` generates:
- `contracts/<name>.fc.md` - populated feature contract
- `contracts/<name>.brief.md` - developer-facing task brief
- optional `contracts/<name>.session.json|yaml` - machine-readable session summary

`grabby orchestrate` additionally generates:
- `contracts/<name>.plan.yaml`
- `contracts/<name>.backlog.yaml`
- `contracts/<name>.execute.md`
- `contracts/<name>.audit.md`

`grabby prompt <file>` generates:
- `contracts/<name>.prompt.md` - a provider-agnostic instruction bundle for handing the work to any LLM

## Non-Interactive Automation

Use flags when `grabby task` or `grabby orchestrate` should run without prompts:

```bash
grabby task "create a unit test" \
  --task-name "login unit test" \
  --objective "Add focused login test coverage." \
  --scope "add a login unit test,avoid production code changes" \
  --done-when "tests pass,lint passes" \
  --testing "Unit: tests/login-unit-test.test.ts" \
  --session-format json \
  --yes
```

Useful flags:
- `--output console|file|both`
- `--task-name`
- `--objective`
- `--scope`
- `--non-goals`
- `--directories`
- `--constraints`
- `--dependencies`
- `--done-when`
- `--testing`
- `--yes` or `--non-interactive`
- `--session-format json|yaml`
- `--session-output <path>`

Session inspection and CI validation:

```bash
grabby session login-unit-test.fc.md --check
grabby session login-unit-test.fc.md --regenerate --format yaml
grabby session login-unit-test.fc.md --regenerate --format json --output-path reports/login.session.json
grabby session --check-all
```

`grabby session --check-all` scans `contracts/` for `*.session.json` and `*.session.yaml` files and exits non-zero when any artifact is invalid or none are found.

## Two-Phase Execution

### Phase 1: PLAN
- Outputs files to modify, rules, risks
- No file edits allowed
- Must be approved before Phase 2

### Phase 2: EXECUTE
- Only modify files from approved plan
- No scope expansion
- Follow `RULESET_CORE` patterns

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
- ARCH_INDEX_v1 section frontend
- RULESET_CORE_v1 section hooks
```


## Ruleset Builder

You can generate a project ruleset from existing markdown and source files interactively:

```bash
grabby ruleset create "harden our frontend delivery standards" --from=README.md,docs/ --title=Frontend Rules
```

If AI keys are configured, Grabby uses your selected provider. Otherwise it falls back to a local template and still includes discovered file references.

## Token Efficiency

This system reduces token usage by:
- Compact contracts
- Reference-based context envelopes
- Structured plans instead of prose
- Two-phase separation of planning and execution

## Reference Documents

After `grabby init`, your project will have:
- `docs/ARCHITECTURE_INDEX.md` - Module map
- `docs/RULESET_CORE.md` - Coding rules
- `docs/ENV_STACK.md` - Environment config
- `docs/EXECUTION_PROTOCOL.md` - Workflow
- `.grabby/config.json` - governance rules, guidance, and Agile planning defaults
- `.grabbyignore` - paths Grabby should ignore for artifact inspection/reporting

`.grabbyignore` supports glob-style patterns such as:
- `**/*.session.json`
- `tmp/*.log`
- `coverage/`
- `!contracts/keep.session.json`

## Recommended Flow

1. Run `grabby task "<request>"` when the task still needs clarification.
2. Run `grabby orchestrate "<request>"` when you want the full multi-persona handoff.
3. Run `grabby validate <file>`, `grabby plan <file>`, `grabby backlog <file>`, or `grabby prompt <file>` when you want individual artifacts.
4. Review `contracts/*.fc.md`, `*.brief.md`, `*.plan.yaml`, `*.backlog.yaml`, and `*.prompt.md` before coding.
5. Use `grabby execute <file>` and `grabby audit <file>` during implementation and verification.
6. Use `grabby session <file> --check` or `grabby session --check-all` in CI or wrapper scripts.

## License

MIT




## Governance Upgrades

- `grabby resolve <contract>`: resolve section-scoped context with token budgets.
- `grabby upgrade-contract <file>`: update pinned contract versions to latest supported set.
- `grabby metrics summary`: summarize per-feature governance metrics from `contracts/*.metrics.json`.
- Execution now hard-fails for out-of-plan file edits and restricted directory writes.
