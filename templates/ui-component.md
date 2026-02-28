# FC: [NAME]
**ID:** [ID] | **Status:** draft

## Objective
Create a [NAME] UI component that [purpose].

## Scope
- Component structure and styling
- Props interface definition
- Event handling
- Accessibility (ARIA labels, keyboard navigation)

## Non-Goals
- Backend integration
- Global state management
- Data fetching

## Directories
**Allowed:** `src/components/`, `src/styles/`, `src/tests/`
**Restricted:** `backend/`, `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/components/[NAME]/[NAME].tsx` | Main component |
| create | `src/components/[NAME]/[NAME].styles.ts` | Component styles |
| create | `src/components/[NAME]/index.ts` | Barrel export |
| create | `src/tests/[NAME].test.tsx` | Unit tests |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Done When
- [ ] Component renders correctly
- [ ] Props are typed
- [ ] Events work as expected
- [ ] Accessible (keyboard, screen reader)
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Unit: `src/tests/[NAME].test.tsx`
- Visual: Storybook story (optional)

## Context Refs
- ARCH_INDEX_v1 §components
- RULESET_CORE_v1 §react §typescript
