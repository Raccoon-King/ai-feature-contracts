const path = require('path');
const { slug } = require('./core.cjs');

function getTaskBriefPath(contractsDir, taskName) {
  return path.join(contractsDir, `${slug(taskName)}.brief.md`);
}

function buildTaskBrief({
  taskName,
  request,
  ticket,
  persona,
  objective,
  scopeItems,
  constraints,
  doneWhen,
}) {
  const scope = scopeItems.length > 0
    ? scopeItems.map((item) => `- ${item}`).join('\n')
    : '- Scope to be clarified';

  return `# Grabby Task Brief: ${taskName}

## Request
${request}

## Ticket
${ticket?.ticketId ? `- Ticket ID: ${ticket.ticketId}\n` : ''}- Who: ${ticket?.who || 'TBD'}
- What: ${ticket?.what || objective}
- Why: ${ticket?.why || 'TBD'}
- Definition of Done:
${(ticket?.dod || []).map((item) => `  - ${item}`).join('\n') || '  - TBD'}

## Facilitator
- Persona: ${persona.agentName}
- Role: ${persona.title}
- Mode: ${persona.mode}
- Why this persona: ${persona.rationale}

## Objective
${objective}

## Scope Breakdown
${scope}

## Constraints
${constraints}

## Done When
${doneWhen}

## Recommended Handoff
\`${persona.handoffCommand}\`
`;
}

module.exports = {
  buildTaskBrief,
  getTaskBriefPath,
};
