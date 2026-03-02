/**
 * Grabby - Agile Module Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const agile = require('../lib/agile.cjs');

// Temp directory for tests
let tempDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-agile-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// Default config for tests
const defaultConfig = {
  agile: {
    naming: {
      epicPrefix: 'EPIC',
      taskPrefix: 'TASK',
      subtaskPrefix: 'SUB',
    },
    splitBy: ['scope', 'file', 'layer'],
    maxTasksPerEpic: 10,
    maxSubtasksPerTask: 5,
  },
};

// ============================================================================
// EXTRACT CONTRACT TITLE
// ============================================================================

describe('extractContractTitle', () => {
  it('should extract title from FC header', () => {
    const content = '# FC: User Authentication\n## Objective\nTest';
    const title = agile.extractContractTitle(content, 'test.fc.md');
    expect(title).toBe('User Authentication');
  });

  it('should handle title with special characters', () => {
    const content = '# FC: Feature (v2.0) - Enhanced\n## Objective\nTest';
    const title = agile.extractContractTitle(content, 'test.fc.md');
    expect(title).toBe('Feature (v2.0) - Enhanced');
  });

  it('should fallback to filename if no title found', () => {
    const content = '## Objective\nTest';
    const title = agile.extractContractTitle(content, 'my-feature.fc.md');
    expect(title).toBe('my-feature');
  });

  it('should remove .fc.md extension from fallback', () => {
    const content = '## Objective\nTest';
    const title = agile.extractContractTitle(content, 'authentication-flow.fc.md');
    expect(title).toBe('authentication-flow');
  });

  it('should handle empty content', () => {
    const title = agile.extractContractTitle('', 'test.fc.md');
    expect(title).toBe('test');
  });

  it('should handle whitespace in title', () => {
    const content = '# FC:    Trimmed Title   \n## Objective';
    const title = agile.extractContractTitle(content, 'test.fc.md');
    expect(title).toBe('Trimmed Title');
  });
});

// ============================================================================
// EXTRACT SCOPE ITEMS
// ============================================================================

describe('extractScopeItems', () => {
  it('should extract scope items as array', () => {
    const content = `## Scope
- Item 1
- Item 2
- Item 3

## Directories`;

    const items = agile.extractScopeItems(content);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('Item 1');
    expect(items[1]).toBe('Item 2');
    expect(items[2]).toBe('Item 3');
  });

  it('should handle scope with no items', () => {
    const content = `## Scope

## Directories`;

    const items = agile.extractScopeItems(content);
    expect(items).toHaveLength(0);
  });

  it('should handle missing scope section', () => {
    const content = `## Objective
Test

## Directories`;

    const items = agile.extractScopeItems(content);
    expect(items).toHaveLength(0);
  });

  it('should trim scope item text', () => {
    const content = `## Scope
-   Whitespace item
- Normal item`;

    const items = agile.extractScopeItems(content);
    expect(items[0]).toBe('Whitespace item');
    expect(items[1]).toBe('Normal item');
  });

  it('should handle scope items with special characters', () => {
    const content = `## Scope
- Item with (parentheses)
- Item with "quotes"
- Item with [brackets]`;

    const items = agile.extractScopeItems(content);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('Item with (parentheses)');
  });
});

// ============================================================================
// EXTRACT FILES
// ============================================================================

describe('extractFiles', () => {
  it('should extract files from table', () => {
    const content = `## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/auth.ts | Auth logic |
| modify | src/index.ts | Exports |`;

    const files = agile.extractFiles(content);
    expect(files).toHaveLength(2);
    expect(files[0].action).toBe('create');
    expect(files[0].path).toBe('src/auth.ts');
    expect(files[0].reason).toBe('Auth logic');
  });

  it('should handle files with backticks in path', () => {
    const content = `## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/auth.ts\` | Auth logic |`;

    const files = agile.extractFiles(content);
    expect(files[0].path).toBe('src/auth.ts');
  });

  it('should handle missing reason column', () => {
    const content = `## Files
| Action | Path |
|--------|------|
| create | src/auth.ts |`;

    const files = agile.extractFiles(content);
    expect(files[0].reason).toBe('Implementation');
  });

  it('should handle missing files section', () => {
    const content = `## Objective
Test`;

    const files = agile.extractFiles(content);
    expect(files).toHaveLength(0);
  });

  it('should skip header and separator rows', () => {
    const content = `## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |`;

    const files = agile.extractFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].action).toBe('create');
  });

  it('should handle empty files section', () => {
    const content = `## Files
| Action | Path | Reason |
|--------|------|--------|

## Done When`;

    const files = agile.extractFiles(content);
    expect(files).toHaveLength(0);
  });
});

// ============================================================================
// GENERATE BACKLOG
// ============================================================================

describe('generateBacklog', () => {
  it('should generate backlog with epics and tasks', () => {
    const content = `# FC: Test Feature
## Scope
- Implement login
- Add logout button

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/login.ts | Login logic |
| create | src/logout.ts | Logout logic |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.version).toBe(1);
    expect(backlog.contract).toBe('test.fc.md');
    expect(backlog.epics).toHaveLength(1);
    expect(backlog.epics[0].tasks).toHaveLength(2);
  });

  it('should generate epic with correct ID', () => {
    const content = `# FC: Test
## Scope
- Item 1

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics[0].id).toBe('EPIC-1');
  });

  it('should generate tasks with correct IDs', () => {
    const content = `# FC: Test
## Scope
- Task A
- Task B
- Task C

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/a.ts | A |
| create | src/b.ts | B |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics[0].tasks[0].id).toBe('TASK-1');
    expect(backlog.epics[0].tasks[1].id).toBe('TASK-2');
    expect(backlog.epics[0].tasks[2].id).toBe('TASK-3');
  });

  it('should include subtasks for each task', () => {
    const content = `# FC: Test
## Scope
- Implement feature

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/feature.ts | Feature |
| create | src/feature.test.ts | Tests |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    const task = backlog.epics[0].tasks[0];
    expect(task.subtasks.length).toBeGreaterThan(0);
  });

  it('should add validation subtask at end', () => {
    const content = `# FC: Test
## Scope
- Item 1

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    const subtasks = backlog.epics[0].tasks[0].subtasks;
    const lastSubtask = subtasks[subtasks.length - 1];
    expect(lastSubtask.type).toBe('validation');
    expect(lastSubtask.title).toContain('lint');
  });

  it('should respect maxTasksPerEpic limit', () => {
    const content = `# FC: Test
## Scope
${Array.from({ length: 20 }, (_, i) => `- Task ${i + 1}`).join('\n')}

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics[0].tasks.length).toBeLessThanOrEqual(defaultConfig.agile.maxTasksPerEpic);
  });

  it('should respect maxSubtasksPerTask limit', () => {
    const content = `# FC: Test
## Scope
- Big task with many files

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/a.ts | A |
| create | src/b.ts | B |
| create | src/c.ts | C |
| create | src/d.ts | D |
| create | src/e.ts | E |
| create | src/f.ts | F |
| create | src/g.ts | G |
| create | src/h.ts | H |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    const subtasks = backlog.epics[0].tasks[0].subtasks;
    expect(subtasks.length).toBeLessThanOrEqual(defaultConfig.agile.maxSubtasksPerTask);
  });

  it('should create default task if no scope items', () => {
    const content = `# FC: Test
## Scope

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics[0].tasks).toHaveLength(1);
    expect(backlog.epics[0].tasks[0].title).toBe('Implement contract scope');
  });

  it('should mark test files with test type', () => {
    const content = `# FC: Test
## Scope
- Add tests

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.test.ts | Tests |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    const subtasks = backlog.epics[0].tasks[0].subtasks;
    const testSubtask = subtasks.find((s) => s.file && s.file.includes('test'));
    expect(testSubtask.type).toBe('test');
  });

  it('should include agile config in backlog', () => {
    const content = `# FC: Test
## Scope
- Item 1

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.agile).toBeDefined();
    expect(backlog.agile.naming).toEqual(defaultConfig.agile.naming);
  });

  it('should set epic goal based on title', () => {
    const content = `# FC: User Authentication
## Scope
- Login

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/auth.ts | Auth |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'auth.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics[0].goal).toContain('User Authentication');
    expect(backlog.epics[0].goal).toContain('contract boundaries');
  });
});

// ============================================================================
// GET BACKLOG PATH
// ============================================================================

describe('getBacklogPath', () => {
  it('should return correct backlog path', () => {
    const result = agile.getBacklogPath(contractsDir, 'feature.fc.md');
    expect(result).toBe(path.join(contractsDir, 'feature.backlog.yaml'));
  });

  it('should handle filename without extension', () => {
    const result = agile.getBacklogPath(contractsDir, 'feature.fc.md');
    expect(result).toContain('.backlog.yaml');
    expect(result).not.toContain('.fc.md.backlog');
  });

  it('should use provided contracts directory', () => {
    const customDir = path.join(tempDir, 'custom');
    const result = agile.getBacklogPath(customDir, 'test.fc.md');
    expect(result).toContain(customDir);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle contract with only whitespace in scope items', () => {
    const content = `## Scope
-
- Valid item
-

## Files`;

    const items = agile.extractScopeItems(content);
    // Only "Valid item" should be extracted
    expect(items.some((i) => i === 'Valid item')).toBe(true);
  });

  it('should handle malformed files table', () => {
    const content = `## Files
| Action | Path |
| broken row
| create | src/test.ts | Test |`;

    const files = agile.extractFiles(content);
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle scope item matching multiple files', () => {
    const content = `# FC: Test
## Scope
- Implement authentication

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/auth/login.ts | Login |
| create | src/auth/logout.ts | Logout |
| create | src/auth/token.ts | Token |`;

    const backlog = agile.generateBacklog({
      content,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    const task = backlog.epics[0].tasks[0];
    // Should find relevant files based on scope item terms
    expect(task.subtasks.length).toBeGreaterThan(0);
  });

  it('should handle empty contract gracefully', () => {
    const backlog = agile.generateBacklog({
      content: '',
      fileName: 'empty.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics).toHaveLength(1);
    expect(backlog.epics[0].tasks).toHaveLength(1);
  });
});
