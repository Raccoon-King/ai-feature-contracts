# Security Policy

## Supported Versions

Grabby is currently maintained on the latest `main` release line.

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| < 2.0   | No        |

## Reporting a Vulnerability

Please do not open public GitHub issues for sensitive vulnerabilities.

1. Open a private security advisory in GitHub: `Security` -> `Advisories` -> `Report a vulnerability`
2. Include:
   - affected version and commit/tag
   - impact and exploitability
   - proof of concept or reproduction steps
   - proposed mitigation if available

We will acknowledge reports as quickly as possible and coordinate a fix and disclosure.

## Security Baseline

This repository enforces:

- branch protection on `main`
- pull request review requirements
- CODEOWNERS review for critical paths
- CI + contract validation checks
- dependency review on pull requests
- CodeQL scanning
- `npm audit` in CI
