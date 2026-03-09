const fs = require('fs');
const path = require('path');

function getRoutingMemoryPath(cwd = process.cwd()) {
  return path.join(cwd, '.grabby', 'metrics', 'routing-memory.json');
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function defaultMemory() {
  return {
    version: 1,
    lastUpdatedAt: null,
    lastSuccessfulAgentBySubstep: {},
    outcomes: [],
  };
}

function readRoutingMemory(options = {}) {
  const filePath = options.filePath || getRoutingMemoryPath(options.cwd);
  if (!fs.existsSync(filePath)) return defaultMemory();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...defaultMemory(),
      ...parsed,
      lastSuccessfulAgentBySubstep: parsed.lastSuccessfulAgentBySubstep || {},
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes : [],
    };
  } catch (_error) {
    return defaultMemory();
  }
}

function writeRoutingMemory(memory, options = {}) {
  const filePath = options.filePath || getRoutingMemoryPath(options.cwd);
  ensureDirFor(filePath);
  fs.writeFileSync(filePath, JSON.stringify(memory, null, 2) + '\n', 'utf8');
  return filePath;
}

function recordRoutingOutcome(entry = {}, options = {}) {
  const memory = readRoutingMemory(options);
  const record = {
    timestamp: new Date().toISOString(),
    substep: String(entry.substep || '').trim().toLowerCase(),
    agentKey: String(entry.agentKey || '').trim().toLowerCase(),
    outcome: String(entry.outcome || 'success').trim().toLowerCase(),
    source: String(entry.source || 'state').trim().toLowerCase(),
  };

  if (!record.substep || !record.agentKey) {
    return {
      memory,
      filePath: options.filePath || getRoutingMemoryPath(options.cwd),
      updated: false,
    };
  }

  memory.outcomes.push(record);
  if (record.outcome === 'success') {
    memory.lastSuccessfulAgentBySubstep[record.substep] = record.agentKey;
  }
  memory.lastUpdatedAt = record.timestamp;
  const filePath = writeRoutingMemory(memory, options);
  return { memory, filePath, updated: true };
}

module.exports = {
  getRoutingMemoryPath,
  readRoutingMemory,
  writeRoutingMemory,
  recordRoutingOutcome,
};

