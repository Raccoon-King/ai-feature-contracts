# FC-004 Metadata Inventory

This document tracks hardcoded URLs, project-specific identifiers, and other metadata discovered during FC-004 implementation.

## Classification

- **Configurable**: Should be read from canonical metadata/config
- **Derived**: Can be computed from canonical sources
- **Example**: Intentionally left as illustration (tests, docs)
- **External**: Third-party/standards reference (keep as-is)

## Project-Owned URLs & Identifiers

### GitHub Repository
- **Values**: `https://github.com/Raccoon-King/ai-feature-contracts`, `Raccoon-King/ai-feature-contracts`
- **Locations**:
  - `package.json` (repository.url, bugs.url)
  - `docs/index.html` (links)
  - `docs/grabby-user-guide.html` (clone example)
- **Classification**: Configurable
- **Action**: Read from package.json or project-metadata

### NPM Package
- **Values**: `grabby`, `https://www.npmjs.com/package/grabby`
- **Locations**:
  - `package.json` (name)
  - `docs/index.html` (links)
- **Classification**: Derived from package.json
- **Action**: Read from package.json

### Website/Homepage
- **Values**: `https://grabbyai.com`, `https://grabbyai-com.pages.dev`
- **Locations**:
  - `package.json` (homepage)
  - `docs/index.html` (links, footer)
- **Classification**: Configurable
- **Action**: Read from package.json or project-metadata

### Schema URLs
- **Values**: `https://grabby.dev/schemas/config.json`
- **Locations**:
  - `lib/config.cjs` ($schema field)
- **Classification**: Configurable
- **Action**: Move to project-metadata

### Documentation URLs
- **Values**: GitHub README, Wiki links
- **Locations**:
  - `docs/index.html` (navigation)
- **Classification**: Derived
- **Action**: Construct from repository URL

## Runtime Defaults

### API Server
- **Values**: `http://127.0.0.1`, `http://localhost`
- **Locations**:
  - `lib/api-server-v2.cjs` (startup messages, CORS)
  - `lib/api-server.cjs` (server messages)
- **Classification**: Configurable default
- **Action**: Move host/port defaults to metadata

### Ollama Default Host
- **Values**: `http://localhost:11434`
- **Locations**:
  - `lib/ai-complete.cjs` (OLLAMA_HOST fallback)
- **Classification**: Configurable default
- **Action**: Move to project-metadata

### Directory Names
- **Values**: `.grabby/`, `contracts/`, `grabby.config.json`
- **Locations**: Throughout codebase
- **Classification**: Convention (keep as-is for now)
- **Action**: No change in this contract

## External References (Keep As-Is)

- `https://no-color.org/` (lib/colors.cjs - standard reference)
- `https://github.com/bmad-code-org/BMAD-METHOD` (lib/interactive-shell.cjs - attribution)

## Summary

- **Total URLs found**: ~25 instances
- **Project-owned**: 8 unique values
- **To centralize**: 6 values
- **External/unchanged**: 2 values
- **Directories to scan**: lib/, bin/, docs/, grabby-website/

## Implementation Plan

1. Create `lib/project-metadata.cjs` with canonical values
2. Update package.json references to use metadata module
3. Update runtime code (api-server, ai-complete) to use metadata
4. Update CLI output in bin/index.cjs
5. Update docs/website templates
6. Add tests for metadata resolution
