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
    // Version string should match a grabby-<version>.tgz pattern
    expect(readme).toMatch(/npm install -g \.\/grabby-[\d.]+\.tgz/);
    expect(readme).toMatch(/npm install -g \.\\grabby-[\d.]+\.tgz/);
    expect(readme).toContain('bundles its runtime dependencies');
  });

  it('documents Windows, macOS, and Linux support explicitly', () => {
    expect(readme).toContain('Windows 10/11');
    expect(readme).toContain('macOS');
    expect(readme).toContain('Linux');
    expect(readme).toContain('Node.js `>=18`');
  });
});
