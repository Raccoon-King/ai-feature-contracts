# Grabby

CLI-first orchestration for AI-assisted development with feature contracts, persona-led workflows, and repo-local guidance.

## Installation

Supported developer environments:
- Windows 10/11 with PowerShell or `cmd`
- macOS with `zsh` or `bash`
- Linux with a POSIX shell

Grabby targets Node.js `>=18` and an npm-compatible installation flow on all three platforms.

### From Source

Windows PowerShell:

```powershell
git clone https://github.com/Raccoon-King/ai-feature-contracts.git
cd ai-feature-contracts
npm install
npm link
grabby --help
```

macOS / Linux:

```bash
git clone https://github.com/Raccoon-King/ai-feature-contracts.git
cd ai-feature-contracts
npm install
npm link
grabby --help
```

## Airgapped Installation

Build the offline artifact on a connected machine:

```bash
git clone https://github.com/Raccoon-King/ai-feature-contracts.git
cd ai-feature-contracts
npm ci
npm pack
```

That produces a tarball such as `grabby-2.0.0.tgz` with Grabby's runtime dependencies bundled into the package.

Move the tarball into the airgapped environment, then install from the local file:

Windows PowerShell:

```powershell
npm install -g .\grabby-2.0.0.tgz
grabby --help
```

macOS / Linux:

```bash
npm install -g ./grabby-2.0.0.tgz
grabby --help
```

Notes:
- No registry access is required during the airgapped install step because the package bundles its runtime dependencies.
- The connected build machine should be used to refresh the tarball whenever runtime dependencies or Grabby code change.
- Core CLI workflows are designed to work on Windows, macOS, and Linux without shell-specific rewrites.

## Quick Start

LLM-focused setup instructions are in [docs/LLM_INSTALL.md](docs/LLM_INSTALL.md).

```bash
# Initialize in your project
cd your-project
grabby init

# Let Grabby interview you and prefill a contract
grabby task "create a unit test"

# Or generate a ticket draft first
grabby ticket "create a unit test"

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

### Brownfield Setup

For an existing repository, start with `grabby init` from the repo root. Grabby will preserve existing project files, install its repo-local guidance, and print a setup summary showing:
- what it created
- what it preserved
- the generated `.grabby/project-context.json` brownfield context snapshot
- the next brownfield-safe steps

Recommended brownfield flow:

```bash
cd your-existing-repo
grabby init

# Review the generated baselines against the real repo
grabby validate contracts/PROJECT-BASELINE.fc.md

# Start a bounded request
grabby ticket "fix login redirect bug"
# or
grabby task "fix login redirect bug"
```

After `grabby init`, review `contracts/PROJECT-BASELINE.fc.md`, `contracts/SYSTEM-BASELINE.fc.md`, and `.grabby/project-context.json` before starting implementation work in an existing codebase.

## Commands

| Command | Description |
|---------|-------------|
| `grabby init` | Initialize in current project |
| `grabby create <request>` | Create a contract and infer a template from plain language when possible |
| `grabby ticket <request>` | Generate a deterministic `Who / What / Why / Definition of Done` ticket draft |
| `grabby task <request>` | Interview-driven task breakdown with persona selection |
| `grabby orchestrate <request>` | Full persona handoff in one CLI session |
| `grabby validate <file>` | Validate contract |
| `grabby plan <file>` | Generate plan (Phase 1) |
| `grabby backlog <file>` | Generate Agile epic/task/subtask backlog |
| `grabby prompt <file>` | Render an LLM instruction bundle |
| `grabby session <file>` | Inspect, check, or regenerate a session artifact |
| `grabby features:list` | List contract-backed features from `contracts/*.fc.md` |
| `grabby features:status <id>` | Show contract/plan/audit status for one feature |
| `grabby features:refresh` | Regenerate `.grabby/features.index.json` |
| `grabby feature:close <id>` | Archive a completed feature into a bundle and remove active artifacts |
| `grabby feature gc [action] [id]` | List, check, archive, or explicitly keep hanging active contracts |
| `grabby contracts:clean-local` | Remove local-only Grabby artifacts under `.grabby/` |
| `grabby session --check-all` | Validate all session artifacts under `contracts/` for CI |
| `grabby approve <file>` | Approve for execution |
| `grabby start <file> [--type feat\|fix\|chore]` | Create a branch from contract ID/title and write `**Branch:**` |
| `grabby pr-template <file>` | Print a PR/MR title + body template from contract metadata |
| `grabby git:status` | Print current branch, dirty state, upstream, and ahead/behind summary |
| `grabby git:sync` | Fetch `origin` and show divergence without changing branch content |
| `grabby git:start <file>` | Create a contract-linked branch with safe defaults |
| `grabby git:update` | Run a guarded branch update flow against the configured base branch |
| `grabby git:preflight [file]` | Verify branch, freshness, contract plan, and required checks before risky work |
| `grabby context:lint` | Validate docs/context-index.yaml file references, sections, and token budgets |
| `grabby policy:check` | Enforce optional contract-required policy from `.grabby/config.json` (CI-focused) |
| `grabby execute <file>` | Show execution instructions (Phase 2) |
| `grabby audit <file>` | Post-execution audit |
| `grabby list` | List all contracts |
| `grabby quick` | Create or implement quick specs |
| `grabby agent <name>` | Load an agent and run its menu/workflows |
| `grabby workflow <name>` | View workflow details directly |
| `grabby agent:lint` | Validate built-in agent definitions and workflow references |
| `grabby db:discover` | Scan the repo for DB, migration, and ORM/query signals |
| `grabby db:refresh` | Generate DB discovery, schema, relations, and code access artifacts |
| `grabby db:lint` | Validate DB artifacts and report stale or inconsistent outputs |
| `grabby api:discover` | Discover API spec surfaces and profile-aware API governance inputs |
| `grabby api:refresh` | Generate `.grabby/be/api.snapshot.json` from source-of-truth API specs |
| `grabby api:lint` | Validate API snapshot freshness and breaking-change signals |
| `grabby fe:discover` | Discover FE package/workspace surfaces and profile-aware FE governance inputs |
| `grabby fe:refresh` | Generate FE dependency, import, and FE-to-BE usage artifacts |
| `grabby fe:lint` | Validate FE dependency/import/API usage artifacts |
| `grabby deps:discover` | Generate a repo-wide code dependency graph artifact |
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

## BMAD-Derived Optional Features

Grabby can enable selected BMAD-inspired behaviors through `bmadFeatures` in `grabby.config.json`:

```json
{
  "bmadFeatures": {
    "adaptiveHelp": true,
    "quickFlowGuardrails": true,
    "riskTieredVerification": true
  }
}
```

When enabled:
- `adaptiveHelp`: `grabby help` shows stage-aware `Suggested Now` guidance.
- `quickFlowGuardrails`: quick flow applies complexity escalation and adversarial review loop guidance.
- `riskTieredVerification`: execution/audit outputs include verification tier and rationale.

## LLM Context Weight

Use `llmContext` in `grabby.config.json` to keep prompts lean:

```json
{
  "llmContext": {
    "mode": "lean",
    "planTokenBudget": 700,
    "executeTokenBudget": 1000,
    "explicitOnly": true,
    "maxSections": 2,
    "useDefaults": false
  }
}
```

`lean` mode only resolves explicitly referenced context sections and uses tighter token budgets.

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

In a brownfield repo, `grabby init` is idempotent:
- existing docs and local override files are preserved
- managed router files are refreshed in place
- baseline contracts are created once and then preserved on reruns
- `.grabby/project-context.json` is refreshed as the current brownfield summary artifact
- stack-specific plugin suggestions are derived from repo signals and stored in `grabby.config.json`
- the setup summary tells you exactly what changed

## Plugin Manager

Grabby treats plugins as repo-level stack capabilities. The runtime can know about a plugin, but each repo decides whether it is enabled.

- `grabby init` records detected plugin suggestions from deterministic repo evidence such as `Chart.yaml`, `keycloak-js`, or stack-specific paths
- the menu-first TUI exposes a `Plugins` manager for enable, disable, read-only mode, and root configuration
- repo state lives in `grabby.config.json` under `plugins.items`

Plugin modes:
- `off`: plugin is known but disabled for the repo
- `read-only`: plugin is enabled for discovery and guidance only
- `active`: plugin is enabled for normal policy/runtime behavior

Current built-in platform coverage:
- `argocd`: Argo CD application, project, and application-set manifest analysis
- `artifactory`: JFrog config discovery, repository reference extraction, and promotion hint summaries
- `harbor`: Harbor config discovery and Harbor-backed image reference analysis
- `helm`: chart discovery, dependency extraction, template inventory, and values-file key summaries
- `keycloak`: realm export discovery, client summaries, role/group context, and identity-provider analysis
- `kubernetes`: manifest discovery, workload/service/ingress relationships, and config/service-account references
- `openshift`: OpenShift Route, Template, DeploymentConfig, ImageStream, SCC, and Project analysis
- `rancher`: legacy Rancher Compose plus modern Rancher/Fleet/provisioning resource normalization

Example repo config:

```json
{
  "plugins": {
    "autoSuggestOnInit": true,
    "items": {
      "kubernetes": {
        "enabled": true,
        "mode": "active",
        "roots": ["deploy/k8s"],
        "detected": true,
        "source": "builtin"
      }
    }
  }
}
```

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

Ticket drafts are emitted as deterministic markdown in stdout. Grabby does not create temporary `.ticket.md` files.

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
- `--ticket-id`
- `--who`
- `--what`
- `--why`
- `--dod`
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

## Ticket Intake Format

Use this shape when pasting a structured ticket:

```markdown
Who: Developers using Grabby
What: Add a Ticket Generator wizard
Why: Developers often start with an idea instead of a full ticket

Definition of Done
- Required fields are present
- DoD is a bullet list
```

Legacy tickets with `What System:` are mapped into the new shape when possible, but new prompts and docs use only `Who / What / Why / Definition of Done`.

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
- `docs/RULESET_DB_SAFETY.md` - DB safety and migration governance
- `docs/RULESET_API_COMPAT.md` - API compatibility and breaking-change policy
- `docs/RULESET_FE_DEPS.md` - Frontend dependency governance
- `docs/RULESET_GIT_WORKFLOW.md` - Team-safe git workflow defaults and rebase policy
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

1. Run `grabby ticket "<request>"` when you need to turn an idea into a structured ticket first.
2. Run `grabby task "<request>"` when the task still needs clarification.
3. Run `grabby orchestrate "<request>"` when you want the full multi-persona handoff.
4. Run `grabby validate <file>`, `grabby plan <file>`, `grabby backlog <file>`, or `grabby prompt <file>` when you want individual artifacts.
5. Review `contracts/*.fc.md`, `*.brief.md`, `*.plan.yaml`, `*.backlog.yaml`, and `*.prompt.md` before coding.
6. Use `grabby execute <file>` and `grabby audit <file>` during implementation and verification.
7. Use `grabby session <file> --check` or `grabby session --check-all` in CI or wrapper scripts.

## Canonical Artifacts

- `contracts/<ID>.fc.md` is the canonical feature/ticket artifact inside the repo.
- `contracts/<ID>.plan.yaml` and `contracts/<ID>.audit.md` remain the retained execution artifacts.
- Completed features may be closed into `contracts/archive/<YEAR>/<ID>.bundle.md`, after which the active FC/plan/audit artifacts are removed and the feature index retains the archive pointer.
- Hanging active contracts can be reviewed with `grabby feature gc list`, enforced in CI with `grabby feature gc check`, archived when complete, or explicitly kept with a recorded reason in `.grabby/features.index.json`.
- Standalone ticket markdown such as `TT-123.md`, `JIRA-123.md`, or `tickets/*.md` is deprecated and should be migrated into the feature contract instead of duplicated.

## Contract Tracking Mode

Set `contracts.trackingMode` in `grabby.config.json`:

```json
{
  "contracts": {
    "trackingMode": "tracked"
  }
}
```

Supported values:
- `tracked`: default behavior, artifacts live under `contracts/` and are part of canonical repo history
- `local-only`: Grabby writes working artifacts under `.grabby/contracts/` and logs activity in `.grabby/feature-log.json`

In `local-only` mode:
- Grabby still supports local intake, planning, and audit workflows
- `grabby features:list` still reports only canonical repo contracts from `contracts/*.fc.md`
- local-only artifacts are intended to stay out of check-in and are ignored via `.gitignore`
- `grabby contracts:clean-local` removes `.grabby/contracts/` and `.grabby/feature-log.json`

## License

MIT

## Acknowledgements

Grabby's persona-led workflow model and selected optional governance patterns are influenced by the BMAD Method project.

- BMAD Method (BMad Code): https://github.com/bmad-code-org/BMAD-METHOD




## Governance Upgrades

- `grabby resolve <contract>`: resolve section-scoped context with token budgets.
- `grabby upgrade-contract <file>`: update pinned contract versions to latest supported set.
- `grabby metrics summary`: summarize per-feature governance metrics from `contracts/*.metrics.json`.
- Execution now hard-fails for out-of-plan file edits and restricted directory writes.
- DB-aware governance artifacts live under `.grabby/db/` after `grabby db:refresh`.
- API governance artifacts live under `.grabby/be/` after `grabby api:refresh`.
- FE governance artifacts live under `.grabby/fe/` after `grabby fe:refresh`.
- Cross-layer dependency graphs live under `.grabby/code/` after `grabby deps:discover`.
- Git orchestration state lives under `.grabby/git/state.json` after `grabby init` or `grabby git:sync`.
