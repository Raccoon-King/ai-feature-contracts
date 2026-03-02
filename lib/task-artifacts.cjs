const path = require('path');
const { slug } = require('./core.cjs');
const SESSION_SCHEMA_VERSION = 1;

function getTaskDefaults(templateName, taskName) {
  const base = slug(taskName) || 'new-feature';

  switch (templateName) {
    case 'bug-fix':
      return {
        directories: ['src/', 'tests/'],
        files: [
          { action: 'modify', path: `src/${base}.ts`, reason: 'Bug fix location' },
          { action: 'create', path: `tests/${base}.test.ts`, reason: 'Regression test' },
        ],
        testing: `- Regression: \`tests/${base}.test.ts\``,
      };
    case 'api-endpoint':
      return {
        directories: ['src/api/', 'src/services/', 'src/types/', 'tests/'],
        files: [
          { action: 'create', path: `src/api/${base}.ts`, reason: 'Route handler' },
          { action: 'create', path: `src/services/${base}Service.ts`, reason: 'Business logic' },
          { action: 'create', path: `src/types/${base}.ts`, reason: 'Request and response types' },
          { action: 'create', path: `tests/${base}.test.ts`, reason: 'API coverage' },
        ],
        testing: `- Unit: \`tests/${base}.test.ts\`\n- Integration: \`tests/${base}.integration.test.ts\``,
      };
    case 'refactor':
      return {
        directories: ['src/', 'tests/'],
        files: [
          { action: 'modify', path: `src/${base}.ts`, reason: 'Refactor target' },
          { action: 'modify', path: `tests/${base}.test.ts`, reason: 'Preserve regression coverage' },
        ],
        testing: '- All existing tests pass\n- Add focused regression coverage if behavior risk is non-trivial',
      };
    case 'ui-component':
      return {
        directories: ['src/components/', 'src/hooks/', 'tests/'],
        files: [
          { action: 'create', path: `src/components/${base}.tsx`, reason: 'UI surface' },
          { action: 'create', path: `tests/${base}.test.tsx`, reason: 'Component coverage' },
        ],
        testing: `- Unit: \`tests/${base}.test.tsx\`\n- Visual/manual: verify states and accessibility`,
      };
    case 'integration':
      return {
        directories: ['src/integrations/', 'src/services/', 'tests/'],
        files: [
          { action: 'create', path: `src/integrations/${base}.ts`, reason: 'Provider integration' },
          { action: 'create', path: `tests/${base}.test.ts`, reason: 'Integration adapter coverage' },
        ],
        testing: `- Unit: \`tests/${base}.test.ts\`\n- Manual: verify provider handshake and failure handling`,
      };
    default:
      return {
        directories: ['src/', 'tests/'],
        files: [
          { action: 'create', path: `src/${base}.ts`, reason: 'Primary implementation' },
          { action: 'create', path: `tests/${base}.test.ts`, reason: 'Unit coverage' },
        ],
        testing: `- Unit: \`tests/${base}.test.ts\``,
      };
  }
}

function normalizeList(items, fallback) {
  const normalized = (items || []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeDoneWhen(doneWhenInput) {
  const items = normalizeList(doneWhenInput, [
    'Tests pass (80%+ coverage)',
    'Lint passes',
    'Build succeeds',
  ]);

  if (!items.some((item) => /80[%+]/i.test(item))) {
    items.push('Tests pass (80%+ coverage)');
  }
  if (!items.some((item) => /lint/i.test(item))) {
    items.push('Lint passes');
  }
  if (!items.some((item) => /build/i.test(item))) {
    items.push('Build succeeds');
  }

  return items;
}

function buildTaskContract({
  taskName,
  id,
  ticket,
  objective,
  scopeItems,
  nonGoals,
  directories,
  files,
  dependencies,
  doneWhen,
  testing,
}) {
  const scopeList = normalizeList(scopeItems, ['Clarify the scoped change']).map((item) => `- ${item}`).join('\n');
  const nonGoalsList = normalizeList(nonGoals, ['No unrelated scope expansion']).map((item) => `- ${item}`).join('\n');
  const fileRows = files.map((file) => `| ${file.action} | \`${file.path}\` | ${file.reason} |`).join('\n');
  const doneList = normalizeDoneWhen(doneWhen).map((item) => `- [ ] ${item}`).join('\n');
  const dependencyLine = dependencies && dependencies.trim() && dependencies.trim().toLowerCase() !== 'none'
    ? dependencies.trim()
    : 'existing packages only';

  return `# FC: ${taskName}
**ID:** ${id} | **Status:** draft

## Ticket
${ticket?.ticketId ? `- Ticket ID: ${ticket.ticketId}\n` : ''}- Who: ${ticket?.who || 'TBD'}
- What: ${ticket?.what || objective}
- Why: ${ticket?.why || 'TBD'}

## Objective
${objective}

## Scope
${scopeList}

## Non-Goals
${nonGoalsList}

## Directories
**Allowed:** ${directories.map((dir) => `\`${dir}\``).join(', ')}
**Restricted:** \`backend/\`, \`node_modules/\`, \`.env*\`

## Files
| Action | Path | Reason |
|--------|------|--------|
${fileRows}

## Dependencies
- Allowed: ${dependencyLine}
- Banned: moment, lodash, jquery
- Security: Run \`npm audit\` before adding packages

## Security Considerations
- [ ] Input validation implemented where external input is involved
- [ ] No secrets in code or test fixtures
- [ ] Dependencies remain CVE-free (\`npm audit\`)

## Code Quality
- [ ] TypeScript strict mode preserved (no \`any\`)
- [ ] No console.log/debugger statements left behind
- [ ] Error handling matches existing project patterns

## Done When
${doneList}

## Testing
${testing}

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
`;
}

function buildExecutionBrief({ fileName, plan, backlog }) {
  const fileList = (plan.files || []).map((file, index) => `${index + 1}. ${file.action}: ${file.path}`).join('\n');
  const contextList = (plan.context || []).map((entry) => `- ${entry}`).join('\n');
  const taskList = ((backlog.epics || [])[0]?.tasks || [])
    .map((task) => `- ${task.id}: ${task.title}`)
    .join('\n');

  return `# Grabby Execution Brief: ${fileName}

## Persona
- Owner: Dev
- Mode: execution

## Context
${contextList || '- ARCH_INDEX_v1\n- RULESET_CORE_v1'}

## File Sequence
${fileList || '- No planned files'}

## Backlog Focus
${taskList || '- No backlog tasks'}

## Execution Rules
1. Implement only approved files.
2. Follow the plan order unless a dependency requires resequencing.
3. Keep tests and validation inside the same change.
4. Do not expand scope without updating the contract first.

## Handoff
\`grabby audit ${fileName}\`
`;
}

function buildAuditChecklist({ fileName, contractContent }) {
  const doneWhenSection = contractContent.match(/## Done When[\s\S]*?(?=##|$)/)?.[0] || '';
  const doneItems = (doneWhenSection.match(/- \[ \] .+$/gm) || []).map((line) => line.replace(/- \[ \]\s*/, '- [ ] '));

  return `# Grabby Audit Checklist: ${fileName}

## Persona
- Owner: Iris
- Mode: audit

## Verify
${doneItems.join('\n') || '- [ ] Confirm contract done-when criteria manually'}
- [ ] Files exist in the planned locations
- [ ] Lint passes
- [ ] Build passes
- [ ] Unexpected scope changes are documented

## Command
\`grabby audit ${fileName}\`
`;
}

function getExecutionBriefPath(contractsDir, fileName) {
  return path.join(contractsDir, fileName.replace(/\.fc\.md$/, '.execute.md'));
}

function getAuditChecklistPath(contractsDir, fileName) {
  return path.join(contractsDir, fileName.replace(/\.fc\.md$/, '.audit.md'));
}

function getSessionPath(contractsDir, fileName, format = 'json') {
  return path.join(contractsDir, fileName.replace(/\.fc\.md$/, `.session.${format}`));
}

function buildSessionSummary({
  request,
  persona,
  contractFile,
  briefFile,
  planFile = null,
  backlogFile = null,
  executionFile = null,
  auditFile = null,
  handoff = null,
  mode = 'task',
}) {
  const session = {
    version: SESSION_SCHEMA_VERSION,
    mode,
    request,
    persona: {
      key: persona.agentKey,
      name: persona.agentName,
      title: persona.title,
      handoffCommand: handoff || persona.handoffCommand,
    },
    artifacts: {
      contractFile,
      briefFile,
      planFile,
      backlogFile,
      executionFile,
      auditFile,
    },
    generatedAt: new Date().toISOString(),
  };
  const validation = validateSessionSummary(session);
  if (!validation.valid) {
    throw new Error(`Invalid session summary: ${validation.errors.join('; ')}`);
  }
  return session;
}

function validateSessionSummary(session) {
  const errors = [];

  if (!session || typeof session !== 'object') {
    return { valid: false, errors: ['Session must be an object'] };
  }

  if (session.version !== SESSION_SCHEMA_VERSION) {
    errors.push(`Unsupported session version: ${session.version}`);
  }

  if (!['task', 'orchestrate'].includes(session.mode)) {
    errors.push(`Invalid mode: ${session.mode}`);
  }

  if (!session.request || typeof session.request !== 'string') {
    errors.push('Session request is required');
  }

  if (!session.persona || typeof session.persona !== 'object') {
    errors.push('Session persona is required');
  } else {
    if (!session.persona.key) {
      errors.push('Session persona.key is required');
    }
    if (!session.persona.name) {
      errors.push('Session persona.name is required');
    }
    if (!session.persona.handoffCommand) {
      errors.push('Session persona.handoffCommand is required');
    }
  }

  if (!session.artifacts || typeof session.artifacts !== 'object') {
    errors.push('Session artifacts are required');
  } else {
    ['contractFile', 'briefFile'].forEach((field) => {
      if (!session.artifacts[field] || typeof session.artifacts[field] !== 'string') {
        errors.push(`Session artifacts.${field} is required`);
      }
    });
  }

  if (!session.generatedAt || Number.isNaN(Date.parse(session.generatedAt))) {
    errors.push('Session generatedAt must be a valid ISO date');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  SESSION_SCHEMA_VERSION,
  getTaskDefaults,
  normalizeDoneWhen,
  buildTaskContract,
  buildExecutionBrief,
  buildAuditChecklist,
  getExecutionBriefPath,
  getAuditChecklistPath,
  getSessionPath,
  buildSessionSummary,
  validateSessionSummary,
};
