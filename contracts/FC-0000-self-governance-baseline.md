# FC-0000 Self-Governance Baseline

## Objective
Enable Grabby to govern itself.

## Allowed_Directories
- lib/
- bin/
- templates/
- docs/
- workflows/

## Restricted_Directories
- node_modules/
- .git/

## Context_Refs
- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1

## Definition_of_Done
- Plan file generated
- Execution restricted to allowed dirs
- Guard passes
- CI validation passes
