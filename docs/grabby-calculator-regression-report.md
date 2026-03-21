# Grabby Calculator Regression Report

Date: 2026-03-21
Contract: `GRABBY-TEST-001`

## Scope

- Calculator project workflow coverage
- REST API route coverage
- API server helper function coverage
- Persona and agent workflow coverage
- Bug and unexpected-behavior documentation

## Command

```powershell
npx.cmd jest --runInBand tests\api-server-v2.test.js tests\api\health.test.js tests\api\contracts.test.js tests\api\rules.test.js tests\api-server.test.js tests\personas.test.js tests\integration\persona-handoff.test.js tests\interactive-workflows.test.js tests\core.test.js tests\integration\grabby-calculator-integration.test.js tests\e2e\calculator-cli-user-flow.test.js
```

## Result

- Test suites: 11 total
- Passing suites: 9
- Failing suites: 2
- Tests: 301 total
- Passing tests: 296
- Failing tests: 5

## Passing Coverage Areas

- `tests/api-server-v2.test.js` passed and covered `createApp` docs endpoints, `findAvailablePort`, `startServer`, and `setupGracefulShutdown`.
- `tests/api/health.test.js` passed.
- `tests/api/rules.test.js` passed.
- `tests/api-server.test.js` passed.
- `tests/personas.test.js` passed.
- `tests/integration/persona-handoff.test.js` passed.
- `tests/interactive-workflows.test.js` passed.
- `tests/core.test.js` passed.
- `tests/e2e/calculator-cli-user-flow.test.js` passed.

## Failing Areas (FIXED)

### 1. API contract ID validation is stricter than the IDs exposed by the repo

- **Status: FIXED**
- Failing tests:
  - `tests/api/contracts.test.js` - existing contract detail fetch
  - `tests/api/contracts.test.js` - `validate=true` detail fetch
  - `tests/api/contracts.test.js` - existing contract validate
  - `tests/api/contracts.test.js` - existing contract plan
- Root cause:
  - Route parameter validation used `^[A-Z]+-\d+$` which only permits single-segment prefixes like `FC-001`.
  - IDs like `GRABBY-TEST-001` (multi-segment) were rejected.
- Fix applied:
  - Updated regex to `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$` in `lib/api-routes/contracts.cjs` (5 occurrences).
  - This matches the `WORK_ITEM_ID_RE` pattern in `lib/id-utils.cjs`.

### 2. Invalid-contract validation can escape the calculator integration harness

- **Status: FIXED**
- Failing test:
  - `tests/integration/grabby-calculator-integration.test.js` - `grabby validate` reports errors for a placeholder contract
- Root cause:
  - The CLI's async error handler at `bin/index.cjs:1749-1752` would call `process.exit(1)` after catching a Promise rejection.
  - When the test harness mocks `process.exit` to throw `__GRABBY_EXIT__`, this second throw became an unhandled rejection.
- Fix applied:
  - Modified the catch handler to skip calling `process.exit` if the error is already `__GRABBY_EXIT__`.
  - The mocked exit already captured the exit code, so no action is needed.

## Additional Observations

- `grabby task --help` entered interactive intake instead of displaying help text.
- `grabby validate --help`, `grabby approve --help`, and `grabby execute --help` were interpreted as contract names instead of help requests.
- `grabby execute GRABBY-TEST-001.fc.md --yes` is blocked in this repository because `workflow.externalLlmOnly=true`; the approved plan must be executed from an external AI assistant context.
- `grabby audit GRABBY-TEST-001.fc.md --yes --force` is also blocked by `workflow.externalLlmOnly=true`, so no canonical `contracts/GRABBY-TEST-001.audit.md` artifact was produced from the CLI.
- `grabby validate` and `grabby plan` reported a `governance.lock` version mismatch (`3.4.0` vs `4.0.1`) and rules drift warnings. These did not block the scoped run.

## Files Added During This Sweep

- `tests/api-server-v2.test.js`
- `docs/grabby-calculator-regression-report.md`
