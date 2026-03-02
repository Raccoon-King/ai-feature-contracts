const fs = require('fs');
const os = require('os');
const path = require('path');
const { executeGraphQL } = require('../lib/graphql.cjs');

describe('graphql helper', () => {
  test('handles health and contracts query', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphql-'));
    fs.writeFileSync(path.join(dir, 'a.fc.md'), '# FC: A\n**ID:** FC-11 | **Status:** draft\n');

    const health = executeGraphQL('{ health { status version } }', { contractsDir: dir });
    expect(health.data.health.status).toBe('ok');

    const contracts = executeGraphQL('{ contracts { id title status } }', { contractsDir: dir });
    expect(contracts.data.contracts.length).toBe(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
