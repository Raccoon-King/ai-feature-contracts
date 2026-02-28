# Step 2: Generate Tests

## Goal
Generate test file templates.

## Test File Template

```typescript
// src/tests/useFeature.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useFeature } from '../hooks/useFeature';

describe('useFeature', () => {
  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useFeature());
      expect(result.current.state).toEqual(defaultState);
    });
  });

  describe('state updates', () => {
    it('should update state correctly', () => {
      const { result } = renderHook(() => useFeature());
      act(() => {
        result.current.updateState(newValue);
      });
      expect(result.current.state).toEqual(expectedState);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', () => {
      // TODO: Implement error handling test
    });
  });
});
```

## Generated Files

```
Files to generate:

1. src/tests/useFeature.test.ts
   Test cases: 8
   [Preview] [Skip] [Edit]

2. src/tests/FeaturePanel.test.tsx
   Test cases: 6
   [Preview] [Skip] [Edit]
```

## Generation Options

```
Generate test files?

[A] Generate all
[S] Select specific files
[P] Preview first
[Q] Quit without generating
```

## Output

```
Generating test files...

✓ Created: src/tests/useFeature.test.ts
✓ Created: src/tests/FeaturePanel.test.tsx

Test files generated!

Run tests: npm test
Run with coverage: npm test -- --coverage
```

## Navigation
- [A] Generate all
- [R] Run tests now
- [Q] Quit
