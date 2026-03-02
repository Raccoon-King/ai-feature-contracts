/**
 * Grabby - Complexity Module Tests
 * Comprehensive regression tests for contract complexity scoring
 */

const complexity = require('../lib/complexity.cjs');

describe('Complexity Module', () => {
  describe('scoreContractComplexity', () => {
    it('should return score structure', () => {
      const content = '# FC: Test\n## Objective\nTest.';
      const result = complexity.scoreContractComplexity(content);

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('recommendations');
    });

    it('should score scope complexity based on bullet points', () => {
      const content = `
## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
`;
      const result = complexity.scoreContractComplexity(content);

      expect(result.breakdown.scope).toBeGreaterThan(0);
      expect(result.breakdown.scope).toBeLessThanOrEqual(3);
    });

    it('should score files complexity based on create/modify actions', () => {
      const content = `
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/a.ts | A |
| create | src/b.ts | B |
| modify | src/c.ts | C |
`;
      const result = complexity.scoreContractComplexity(content);

      expect(result.breakdown.files).toBeGreaterThan(0);
    });

    it('should score dependencies complexity', () => {
      const content = `
## Dependencies
- Add new package: zod
- Install express
`;
      const result = complexity.scoreContractComplexity(content);

      expect(result.breakdown.dependencies).toBeGreaterThan(0);
    });

    it('should score security complexity', () => {
      const content = `
## Security Considerations
- [ ] Validate inputs
- [ ] Encode outputs
- [x] Check permissions
`;
      const result = complexity.scoreContractComplexity(content);

      expect(result.breakdown.security).toBeGreaterThan(0);
    });

    it('should score integration complexity', () => {
      const content = `
## Objective
Build API endpoint for webhook integration with external database auth.
`;
      const result = complexity.scoreContractComplexity(content);

      expect(result.breakdown.integration).toBeGreaterThan(0);
    });

    it('should cap total score at 10', () => {
      const content = `
## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
- Item 7
- Item 8

## Files
| Action | Path |
|--------|------|
| create | a.ts |
| create | b.ts |
| create | c.ts |
| create | d.ts |
| create | e.ts |

## Dependencies
- Add new package
- Install another
- Add third one

## Security
- [ ] Check 1
- [ ] Check 2
- [ ] Check 3
- [ ] Check 4
- [ ] Check 5
- [ ] Check 6
- [ ] Check 7

## Objective
API endpoint webhook external third-party integration database auth.
`;
      const result = complexity.scoreContractComplexity(content);

      expect(result.score).toBeLessThanOrEqual(10);
    });
  });

  describe('getComplexityLevel', () => {
    it('should return trivial for scores <= 2', () => {
      expect(complexity.getComplexityLevel(1)).toBe('trivial');
      expect(complexity.getComplexityLevel(2)).toBe('trivial');
    });

    it('should return simple for scores 2-4', () => {
      expect(complexity.getComplexityLevel(3)).toBe('simple');
      expect(complexity.getComplexityLevel(4)).toBe('simple');
    });

    it('should return moderate for scores 4-6', () => {
      expect(complexity.getComplexityLevel(5)).toBe('moderate');
      expect(complexity.getComplexityLevel(6)).toBe('moderate');
    });

    it('should return complex for scores 6-8', () => {
      expect(complexity.getComplexityLevel(7)).toBe('complex');
      expect(complexity.getComplexityLevel(8)).toBe('complex');
    });

    it('should return very-complex for scores > 8', () => {
      expect(complexity.getComplexityLevel(9)).toBe('very-complex');
      expect(complexity.getComplexityLevel(10)).toBe('very-complex');
    });
  });

  describe('estimateLOC', () => {
    it('should return zero for missing Files section', () => {
      const content = '# FC: Test\n## Objective\nTest.';
      const result = complexity.estimateLOC(content);

      expect(result.estimated).toBe(0);
      expect(result.confidence).toBe('low');
    });

    it('should estimate LOC based on file counts', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/a.ts |
| create | src/b.ts |
| modify | src/c.ts |
`;
      const result = complexity.estimateLOC(content);

      // 2 creates * 100 + 1 modify * 30 = 230
      expect(result.estimated).toBe(230);
      expect(result.newFiles).toBe(2);
      expect(result.modifiedFiles).toBe(1);
    });

    it('should return medium confidence for many files', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/a.ts |
| create | src/b.ts |
| create | src/c.ts |
| create | src/d.ts |
| create | src/e.ts |
| create | src/f.ts |
`;
      const result = complexity.estimateLOC(content);

      expect(result.confidence).toBe('medium');
    });
  });

  describe('analyzeRisks', () => {
    it('should detect authentication risks', () => {
      const content = '## Objective\nImplement user authentication and login flow.';
      const result = complexity.analyzeRisks(content);

      expect(result.risks.some(r => r.risk.includes('Authentication'))).toBe(true);
      expect(result.highCount).toBeGreaterThan(0);
    });

    it('should detect payment risks', () => {
      const content = '## Objective\nIntegrate Stripe payment processing.';
      const result = complexity.analyzeRisks(content);

      expect(result.risks.some(r => r.risk.includes('Payment'))).toBe(true);
    });

    it('should detect database risks', () => {
      const content = '## Objective\nAdd database migration for new schema.';
      const result = complexity.analyzeRisks(content);

      expect(result.risks.some(r => r.risk.includes('Database'))).toBe(true);
    });

    it('should detect destructive operation risks', () => {
      const content = '## Objective\nDelete old user records and drop unused tables.';
      const result = complexity.analyzeRisks(content);

      expect(result.risks.some(r => r.risk.includes('Destructive'))).toBe(true);
    });

    it('should detect refactoring risks', () => {
      const content = '## Objective\nRefactor the authentication module.';
      const result = complexity.analyzeRisks(content);

      expect(result.risks.some(r => r.risk.includes('Refactoring'))).toBe(true);
    });

    it('should detect missing sections', () => {
      const content = '## Objective\nSimple task.';
      const result = complexity.analyzeRisks(content);

      expect(result.risks.some(r => r.risk.includes('Missing'))).toBe(true);
    });

    it('should count risks by severity', () => {
      const content = '## Objective\nAuthentication with payment integration.\n## Scope\n- Item';
      const result = complexity.analyzeRisks(content);

      expect(result.highCount).toBeGreaterThanOrEqual(0);
      expect(result.mediumCount).toBeGreaterThanOrEqual(0);
      expect(result.lowCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkAntiPatterns', () => {
    it('should detect broad scope', () => {
      const content = `
## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
- Item 7
- Item 8
- Item 9
- Item 10
- Item 11
`;
      const result = complexity.checkAntiPatterns(content);

      expect(result.some(i => i.type === 'broad-scope')).toBe(true);
    });

    it('should detect vague objectives', () => {
      const content = `
## Objective
Improve the overall performance and enhance user experience.
`;
      const result = complexity.checkAntiPatterns(content);

      expect(result.some(i => i.type === 'vague-objective')).toBe(true);
    });

    it('should detect missing test files', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/main.ts |
| modify | src/utils.ts |
`;
      const result = complexity.checkAntiPatterns(content);

      expect(result.some(i => i.type === 'missing-tests')).toBe(true);
    });

    it('should not flag test files as missing tests', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/main.ts |
| create | tests/main.test.ts |
`;
      const result = complexity.checkAntiPatterns(content);

      expect(result.some(i => i.type === 'missing-tests')).toBe(false);
    });

    it('should detect no criteria in Done When', () => {
      const content = `
## Done When
This feature is complete.
`;
      const result = complexity.checkAntiPatterns(content);

      expect(result.some(i => i.type === 'no-criteria')).toBe(true);
    });

    it('should detect wildcard in directories', () => {
      const content = `
**Allowed:** \`*\`
`;
      const result = complexity.checkAntiPatterns(content);

      expect(result.some(i => i.type === 'unrestricted-dirs')).toBe(true);
    });

    it('should return empty array for well-formed contract', () => {
      const content = `
## Scope
- Item 1
- Item 2

## Objective
Create a specific feature for user login.

## Files
| Action | Path |
|--------|------|
| create | src/login.ts |
| create | tests/login.test.ts |

## Done When
- [ ] Tests pass
- [ ] Lint passes
`;
      const result = complexity.checkAntiPatterns(content);

      // No broad scope, no vague terms, has tests, has criteria
      expect(result.filter(i => ['broad-scope', 'vague-objective', 'missing-tests', 'no-criteria'].includes(i.type))).toHaveLength(0);
    });
  });
});
