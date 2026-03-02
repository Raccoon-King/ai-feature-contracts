/**
 * Lightweight GraphQL-style interface for Grabby contracts.
 * Supports a focused subset of read-only queries without external deps.
 */

const fs = require('fs');
const path = require('path');

function readContracts(contractsDir) {
  if (!fs.existsSync(contractsDir)) return [];

  return fs.readdirSync(contractsDir)
    .filter(f => f.endsWith('.fc.md'))
    .map(file => {
      const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
      const title = content.match(/^# FC:\s+(.+)$/m)?.[1] || file;
      const id = content.match(/\*\*ID:\*\*\s*(FC-\d+)/)?.[1] || 'unknown';
      const status = content.match(/\*\*Status:\*\*\s*(\w+)/)?.[1] || 'unknown';
      return { id, title, status, file };
    });
}

function executeGraphQL(query, context = {}) {
  const normalized = String(query || '').replace(/\s+/g, ' ').trim();
  const contracts = readContracts(context.contractsDir);

  if (/\bhealth\b/i.test(normalized)) {
    return { data: { health: { status: 'ok', version: '2.0.0' } } };
  }

  if (/\bcontracts\b/i.test(normalized)) {
    const id = normalized.match(/id\s*:\s*"([^"]+)"/i)?.[1];
    const filtered = id ? contracts.filter(c => c.id === id || c.file === id) : contracts;
    return { data: { contracts: filtered } };
  }

  return { errors: [{ message: 'Unsupported query' }] };
}

module.exports = { executeGraphQL, readContracts };
