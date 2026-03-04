# Grabby LLM Install Guide

Use this guide when an LLM app such as Codex, Continue, Cline, or another agent runner needs to install Grabby and initialize it in a target repository without improvising the workflow.

## Goal

Produce a working `grabby` CLI and a repo-local Grabby setup with:
- `contracts/`
- `.grabby/config.json`
- `.grabby/project-context.json`
- baseline contracts
- installed router/guidance files for supported LLM tools

## Install Grabby

### Option 1: Install From Source

Use this when you have the Grabby repository available and internet access is allowed for dependency install.

```bash
git clone https://github.com/Raccoon-King/ai-feature-contracts.git
cd ai-feature-contracts
npm install
npm link
grabby --help
```

### Option 2: Airgapped Install

Build the package on a connected machine:

```bash
git clone https://github.com/Raccoon-King/ai-feature-contracts.git
cd ai-feature-contracts
npm ci
npm pack
```

Install the generated tarball on the offline machine:

```bash
npm install -g ./grabby-<version>.tgz
grabby --help
```

Grabby bundles its runtime dependencies into the package tarball, so the offline install step does not require registry access.

## Initialize Grabby In A Target Repository

Run these commands from the target repository root.

### Brownfield Or Existing Repository

```bash
cd <target-repo>
grabby init --interactive
grabby list
grabby agent:lint
```

Expected results:
- existing project files are preserved
- Grabby guidance/router files are refreshed
- `.grabby/project-context.json` is generated or refreshed
- `contracts/SYSTEM-BASELINE.fc.md` and `contracts/PROJECT-BASELINE.fc.md` exist

### New Repository

```bash
cd <target-repo>
grabby init
grabby list
```

## Optional: Build A Repo Ruleset

Use this when the repository already has rules in files like `AGENTS.md`, `docs/`, `.codex/rules`, `.continue/rules`, `.cline/rules`, or `.clinerules`.

Interactive:

```bash
grabby ruleset create "Consolidate existing repo rules"
```

Deterministic:

```bash
grabby ruleset create "Consolidate existing repo rules" --title="Project Rules" --from=AGENTS.md,docs,.codex/rules,.continue/rules,.cline/rules,.clinerules --yes
```

Expected result:
- a local ruleset file under `.grabby/rulesets/`

## Recommended LLM Usage Contract

After installation, place explicit Grabby instructions in the target repo `AGENTS.md` so another LLM starts with Grabby instead of editing files directly.

Recommended instruction block:

```md
Use Grabby for non-trivial work in this repository.

Default workflow:
1. `grabby list`
2. `grabby ticket "<request>"` if no active contract exists
3. `grabby validate contracts/<ID>.fc.md`
4. `grabby plan contracts/<ID>.fc.md`
5. `grabby approve contracts/<ID>.fc.md`
6. `grabby execute contracts/<ID>.fc.md`
7. Implement only within approved scope
8. `grabby audit contracts/<ID>.fc.md`
```

## Deterministic Command Sequence For Another LLM

Use this sequence when you want the LLM to install and start safely in an existing repository:

```bash
grabby init --interactive
grabby list
grabby agent:lint
grabby ticket "<user request>"
grabby validate contracts/<ID>.fc.md
grabby plan contracts/<ID>.fc.md
grabby approve contracts/<ID>.fc.md
grabby execute contracts/<ID>.fc.md
```

Replace `<ID>` with the generated contract ID from `grabby ticket` or `grabby create`.

## Verification

Useful checks after setup:

```bash
grabby --help
grabby list
grabby agent:lint
```

Useful checks after work is complete:

```bash
grabby audit contracts/<ID>.fc.md
npm run lint
npm test -- --runInBand
```

## Notes For Codex And Similar Agents

- Prefer `grabby ticket` or `grabby task` over writing a contract by hand.
- Do not skip `validate`, `plan`, `approve`, or `execute`.
- Do not edit files outside the approved contract scope.
- Review `.grabby/project-context.json` before making brownfield changes.
- If the repo has no active contracts, start with `grabby list` and create one.
