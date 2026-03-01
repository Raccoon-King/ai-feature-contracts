# RULESET_CORE_v1

## §contracts
- All features require approved contracts
- Use `grabby task "feature"` to create
- Validate before implementation
- Audit after completion
- 80%+ test coverage required

## §typescript
- strict: true
- noAny: true
- explicitReturnTypes: true
- noUnusedVars: true

## §react
- Functional components only
- Hooks for state/effects
- No inline styles
- Props interface required

## §hooks
```typescript
export function useX(id: string): UseXResult {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // fetch + cleanup
  return { data, loading, error };
}
```

## §services
```typescript
export const xService = {
  async get(id: string): Promise<T> {
    return apiClient.get(`/api/v2/x/${id}`);
  }
};
```

## §errors
```typescript
try {
  const result = await op();
} catch (e) {
  logger.error('[Context]', e);
  throw new Error('User-friendly message');
}
```

## §naming
- Components: PascalCase
- Hooks: useX
- Services: xService
- Utils: camelCase

## §testing
- Coverage: 80%+ new code
- Unit: `*.test.ts`
- E2E: `*.spec.ts`

## §forbidden
- node_modules/
- .env*
- eval()
- @ts-ignore
