# Contributing to Grabby

Thank you for your interest in contributing! This document outlines the process for contributing to the project.

## Code of Conduct

Be respectful and constructive. Harassment of any kind will not be tolerated.

## Feature Contract Requirement

This project uses Grabby's own contract system. **All contributions must be backed by a feature contract.**

```bash
# For features / refactors
grabby task "describe your change"

# For small fixes (< 3 files)
grabby quick
```

See [CLAUDE.md](./CLAUDE.md) for the full required workflow.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-user>/ai-feature-contracts.git`
3. Install dependencies: `npm ci`
4. Run the tests: `npm test`

## Branching

| Branch type | Pattern | Example |
|-------------|---------|---------|
| Feature | `feat/<short-description>` | `feat/auto-backlog` |
| Bug fix | `fix/<short-description>` | `fix/validate-crash` |
| Chore / docs | `chore/<description>` | `chore/update-deps` |

Branch off `main` and open a PR back to `main`.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(scope): short description

Optional longer body.
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

## Pull Request Checklist

- [ ] Feature contract created and approved
- [ ] Tests added / updated (80 %+ coverage)
- [ ] `npm test` passes locally
- [ ] `npm audit` shows no high/critical issues
- [ ] Commit messages follow Conventional Commits

## Code Standards

- TypeScript strict mode — no `any`
- ESLint must pass with no warnings
- Functions ≤ 50 lines
- No `console.log` in production code
- No secrets committed to source

## Reporting Bugs

Open an issue using the **Bug Report** template. For security vulnerabilities, follow the [Security Policy](./SECURITY.md) — do **not** open a public issue.

## Requesting Features

Open an issue using the **Feature Request** template or start a discussion.

## License

By contributing you agree that your contributions will be licensed under the [MIT License](./LICENSE).
