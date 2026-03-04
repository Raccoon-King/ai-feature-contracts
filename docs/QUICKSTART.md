# Grabby Quickstart (10 minutes)

For an existing repository, treat this as a brownfield setup flow: run `grabby init`, read the setup summary, and review the generated baseline contracts before starting feature work.

1. Initialize:
   ```bash
   grabby init
   ```
   Brownfield note:
   - existing docs and local overrides are preserved
   - managed Grabby router files are refreshed
   - `.grabby/project-context.json` is refreshed with the current brownfield summary
   - the setup summary shows what was created, updated, and preserved
2. Create contract:
   ```bash
   grabby create "sample feature"
   ```
   In a brownfield repo, `grabby ticket "request"` or `grabby task "request"` is usually a better first step than creating a blank contract directly.
3. Fill required fields in `contracts/*.fc.md` including pinned versions and compact context refs.
4. Validate:
   ```bash
   grabby validate contracts/sample-feature.fc.md
   ```
5. Plan:
   ```bash
   grabby plan contracts/sample-feature.fc.md
   ```
6. Approve:
   ```bash
   grabby approve contracts/sample-feature.fc.md
   ```
7. Execute with guardrails:
   ```bash
   grabby execute contracts/sample-feature.fc.md
   ```
8. Audit:
   ```bash
   grabby audit contracts/sample-feature.fc.md
   ```
9. Review governance metrics:
   ```bash
   grabby metrics summary
   ```

## Failure example (enforcement)
If files outside the plan are modified, execution hard-fails with:
`Execution guard failure: Out-of-scope file modified: <file>`
