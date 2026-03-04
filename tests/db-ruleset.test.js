const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

describe('db ruleset governance', () => {
  const root = path.join(__dirname, '..');

  test('indexes db-safety ruleset in context-index', () => {
    const index = yaml.parse(fs.readFileSync(path.join(root, 'docs', 'context-index.yaml'), 'utf8'));
    expect(index.references.RULESET['db-safety@v1']).toMatchObject({
      file: 'RULESET_DB_SAFETY.md',
      section: 'Migration Safety',
      status: 'active',
    });
  });

  test('documents required db-safety topics', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'RULESET_DB_SAFETY.md'), 'utf8');
    expect(content).toContain('Migration Safety');
    expect(content).toContain('rollback');
    expect(content).toContain('backfill');
    expect(content).toContain('CI');
    expect(content).toContain('schema.snapshot.json');
  });

  test('pins db-safety in governance lock', () => {
    const lock = yaml.parse(fs.readFileSync(path.join(root, '.grabby', 'governance.lock'), 'utf8'));
    expect(lock.governance.pinned_refs.RULESET).toContain('db-safety@v1');
  });

  test('indexes API compatibility and FE dependency rulesets plus checks env ref', () => {
    const index = yaml.parse(fs.readFileSync(path.join(root, 'docs', 'context-index.yaml'), 'utf8'));
    expect(index.references.RULESET['api-compat@v1']).toMatchObject({
      file: 'RULESET_API_COMPAT.md',
      section: 'Breaking Change Policy',
      status: 'active',
    });
    expect(index.references.RULESET['fe-deps@v1']).toMatchObject({
      file: 'RULESET_FE_DEPS.md',
      section: 'Dependency Policy',
      status: 'active',
    });
    expect(index.references.ENV['checks@v1']).toMatchObject({
      file: 'ENV_STACK.md',
      section: 'Checks',
      status: 'active',
    });
  });

  test('documents API compatibility, FE dependency policy, and pins them in governance lock', () => {
    const apiCompat = fs.readFileSync(path.join(root, 'docs', 'RULESET_API_COMPAT.md'), 'utf8');
    const feDeps = fs.readFileSync(path.join(root, 'docs', 'RULESET_FE_DEPS.md'), 'utf8');
    const env = fs.readFileSync(path.join(root, 'docs', 'ENV_STACK.md'), 'utf8');
    const lock = yaml.parse(fs.readFileSync(path.join(root, '.grabby', 'governance.lock'), 'utf8'));

    expect(apiCompat).toContain('Breaking Change Policy');
    expect(apiCompat).toContain('deprecation');
    expect(apiCompat).toContain('api.snapshot.json');
    expect(feDeps).toContain('Dependency Policy');
    expect(feDeps).toContain('lockfiles');
    expect(feDeps).toContain('deps.snapshot.json');
    expect(env).toContain('## Checks');
    expect(lock.governance.pinned_refs.RULESET).toContain('api-compat@v1');
    expect(lock.governance.pinned_refs.RULESET).toContain('fe-deps@v1');
    expect(lock.governance.pinned_refs.ENV).toContain('checks@v1');
  });

  test('indexes git workflow rules and git commands env ref', () => {
    const index = yaml.parse(fs.readFileSync(path.join(root, 'docs', 'context-index.yaml'), 'utf8'));
    expect(index.references.RULESET['git-workflow@v1']).toMatchObject({
      file: 'RULESET_GIT_WORKFLOW.md',
      section: 'Safe Defaults',
      status: 'active',
    });
    expect(index.references.ENV['git-commands@v1']).toMatchObject({
      file: 'ENV_STACK.md',
      section: 'Git Commands',
      status: 'active',
    });
  });

  test('documents git workflow rules and pins them in governance lock', () => {
    const content = fs.readFileSync(path.join(root, 'docs', 'RULESET_GIT_WORKFLOW.md'), 'utf8');
    const env = fs.readFileSync(path.join(root, 'docs', 'ENV_STACK.md'), 'utf8');
    const lock = yaml.parse(fs.readFileSync(path.join(root, '.grabby', 'governance.lock'), 'utf8'));
    expect(content).toContain('Never force-push by default');
    expect(content).toContain('protected branch');
    expect(content).toContain('contract ID');
    expect(env).toContain('## Git Commands');
    expect(lock.governance.pinned_refs.RULESET).toContain('git-workflow@v1');
    expect(lock.governance.pinned_refs.ENV).toContain('git-commands@v1');
  });
});
