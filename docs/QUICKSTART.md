# Grabby Quickstart (10 minutes)

1. Initialize:
   ```bash
   grabby init
   ```
2. Create contract:
   ```bash
   grabby create "sample feature"
   ```
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
