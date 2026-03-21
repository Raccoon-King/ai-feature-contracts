# Grabby Task Brief: Add a localhost developer UI for contract visualization and artifact management

## Request
add a localhost frontend interface for developer contract visualization and API-driven contract workflow management

## Ticket
- Ticket ID: GRAB-CONTRACT-UI-001
- Who: Grabby developers and maintainers
- What: add a localhost frontend interface for developer contract visualization and API-driven contract workflow management
- Why: developers need a local visual interface to inspect contracts, see lifecycle state, review all related artifacts, and trigger API-backed actions without relying on raw markdown files as the primary workflow
- Definition of Done:
  - Developers can browse existing contracts in a localhost UI
  - A selected contract shows all related artifact files in a structured visual layout
  - Status, progress, and file-change cues are highlighted
  - The brief can be copied directly from the interface
  - Supported workflow actions use the existing local API

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: The feature crosses UI, local API shape, and developer workflow design.

## Objective
Deliver a localhost-only developer workspace for browsing existing contracts, visualizing their related artifacts, highlighting developer-relevant status and progress signals, and copying the brief directly from the UI.

## Scope Breakdown
- Add a local contract workspace UI
- Expose related contract artifacts through the existing API surface in a UI-friendly shape
- Render artifact and workflow data visually instead of as raw markdown only
- Keep the experience focused on developer contract review and management

## Constraints
Stay within `grabby-website/`, `lib/api-routes/contracts.cjs`, `lib/api-server-v2.cjs`, `tests/api/`, `docs/`, and the governing contract artifacts.

## Done When
Developers can browse existing contracts, visualize related artifact bundles, see highlighted status/progress/change signals, copy the brief, and use supported local API-backed workflow actions from the UI

## Recommended Handoff
`grabby agent architect CC`
