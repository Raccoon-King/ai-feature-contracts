const fs = require('fs');
const path = require('path');

describe('offline packaging metadata', () => {
  const repoRoot = path.join(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

  it('bundles all runtime dependencies for offline installation', () => {
    const runtimeDeps = Object.keys(packageJson.dependencies || {}).sort();
    const bundledDeps = [...(packageJson.bundleDependencies || [])].sort();

    expect(bundledDeps).toEqual(runtimeDeps);
  });

  it('publishes the runtime files needed by the CLI', () => {
    expect(packageJson.files).toEqual(expect.arrayContaining([
      'bin/',
      'lib/',
      'templates/',
      'docs/',
      'agents/',
      'workflows/',
      'hooks/',
      'README.md',
    ]));
  });

  it('documents the airgapped installation flow', () => {
    expect(readme).toContain('## Airgapped Installation');
    expect(readme).toContain('npm pack');
    expect(readme).toContain('npm install -g ./grabby-2.0.0.tgz');
    expect(readme).toContain('bundles its runtime dependencies');
  });
});
