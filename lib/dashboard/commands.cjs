'use strict';

const commands = {
  workflow: {
    name: 'Primary Workflow',
    description: 'Core contract lifecycle commands',
    commands: [
      {
        name: 'grabby',
        description: 'Open the interactive menu (TTY only)',
        usage: 'grabby',
        example: 'grabby',
      },
      {
        name: 'grabby init',
        description: 'Initialize Grabby in current project',
        usage: 'grabby init',
        example: 'grabby init',
      },
      {
        name: 'grabby task',
        description: 'Persona-led task breakdown and scaffold',
        usage: 'grabby task <request>',
        example: 'grabby task "add user authentication"',
      },
      {
        name: 'grabby create',
        description: 'Create a new feature contract',
        usage: 'grabby create <name>',
        example: 'grabby create AUTH-LOGIN-001',
      },
      {
        name: 'grabby validate',
        description: 'Validate a contract for errors',
        usage: 'grabby validate <file>',
        example: 'grabby validate AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby plan',
        description: 'Generate execution plan (Phase 1)',
        usage: 'grabby plan <file>',
        example: 'grabby plan AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby approve',
        description: 'Approve contract for execution',
        usage: 'grabby approve <file>',
        example: 'grabby approve AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby execute',
        description: 'Get execution instructions (Phase 2)',
        usage: 'grabby execute <file>',
        example: 'grabby execute AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby audit',
        description: 'Post-execution audit and verification',
        usage: 'grabby audit <file>',
        example: 'grabby audit AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby list',
        description: 'List all contracts and their status',
        usage: 'grabby list',
        example: 'grabby list',
      },
    ],
  },
  git: {
    name: 'Git & Workflow Safety',
    description: 'Git integration and workflow protection',
    commands: [
      {
        name: 'grabby git:status',
        description: 'Show branch, dirty state, upstream, and divergence',
        usage: 'grabby git:status',
        example: 'grabby git:status',
      },
      {
        name: 'grabby git:sync',
        description: 'Fetch origin and report divergence safely',
        usage: 'grabby git:sync',
        example: 'grabby git:sync',
      },
      {
        name: 'grabby git:start',
        description: 'Create a contract-linked branch',
        usage: 'grabby git:start <file>',
        example: 'grabby git:start AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby git:update',
        description: 'Run a guarded branch update flow',
        usage: 'grabby git:update',
        example: 'grabby git:update',
      },
      {
        name: 'grabby git:preflight',
        description: 'Verify git readiness before risky work',
        usage: 'grabby git:preflight [file]',
        example: 'grabby git:preflight AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby preflight',
        description: 'Run comprehensive local checks before push',
        usage: 'grabby preflight [--quick|--all]',
        example: 'grabby preflight --all',
      },
      {
        name: 'grabby init-hooks',
        description: 'Install git hooks for contract enforcement',
        usage: 'grabby init-hooks',
        example: 'grabby init-hooks',
      },
    ],
  },
  agents: {
    name: 'Agent Commands',
    description: 'AI agent interaction and workflows',
    commands: [
      {
        name: 'grabby agent list',
        description: 'List all available agents',
        usage: 'grabby agent list',
        example: 'grabby agent list',
      },
      {
        name: 'grabby agent',
        description: 'Load a specific agent and show menu',
        usage: 'grabby agent <name>',
        example: 'grabby agent architect',
      },
      {
        name: 'grabby orchestrate',
        description: 'Full persona handoff in one CLI session',
        usage: 'grabby orchestrate <request>',
        example: 'grabby orchestrate "build user dashboard"',
      },
      {
        name: 'grabby quick',
        description: 'Quick flow for small bounded changes',
        usage: 'grabby quick',
        example: 'grabby quick',
      },
      {
        name: 'grabby party',
        description: 'Show full team handoff map',
        usage: 'grabby party',
        example: 'grabby party',
      },
    ],
  },
  features: {
    name: 'Feature Lifecycle',
    description: 'Feature tracking and management',
    commands: [
      {
        name: 'grabby features:list',
        description: 'List contract-backed features',
        usage: 'grabby features:list',
        example: 'grabby features:list',
      },
      {
        name: 'grabby features:status',
        description: 'Show contract/plan/audit status for a feature',
        usage: 'grabby features:status <id>',
        example: 'grabby features:status AUTH-LOGIN-001',
      },
      {
        name: 'grabby feature close',
        description: 'Archive a completed feature',
        usage: 'grabby feature close <id>',
        example: 'grabby feature close AUTH-LOGIN-001',
      },
      {
        name: 'grabby feature gc',
        description: 'Manage hanging active contracts',
        usage: 'grabby feature gc [list|archive|keep]',
        example: 'grabby feature gc list',
      },
    ],
  },
  policy: {
    name: 'Policy & Governance',
    description: 'Policy checks and context management',
    commands: [
      {
        name: 'grabby context:lint',
        description: 'Validate context references',
        usage: 'grabby context:lint',
        example: 'grabby context:lint',
      },
      {
        name: 'grabby policy:check',
        description: 'Apply governance policy checks',
        usage: 'grabby policy:check',
        example: 'grabby policy:check',
      },
      {
        name: 'grabby guard',
        description: 'Validate execution scope from plan',
        usage: 'grabby guard <file>',
        example: 'grabby guard AUTH-LOGIN-001.fc.md',
      },
    ],
  },
  utilities: {
    name: 'Utilities',
    description: 'Helper commands and tools',
    commands: [
      {
        name: 'grabby prompt',
        description: 'Render an LLM instruction bundle',
        usage: 'grabby prompt <file>',
        example: 'grabby prompt AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby backlog',
        description: 'Generate Agile epic/task/subtask backlog',
        usage: 'grabby backlog <file>',
        example: 'grabby backlog AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby session',
        description: 'Inspect or regenerate session artifacts',
        usage: 'grabby session <file>',
        example: 'grabby session AUTH-LOGIN-001.fc.md',
      },
      {
        name: 'grabby ui',
        description: 'Open the web-based dashboard UI',
        usage: 'grabby ui [--port <port>]',
        example: 'grabby ui --port 3847',
      },
    ],
  },
};

function getAllCommands() {
  return commands;
}

function getCommandsByCategory(category) {
  return commands[category] || null;
}

function searchCommands(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();

  Object.entries(commands).forEach(([categoryKey, category]) => {
    category.commands.forEach((cmd) => {
      if (
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.description.toLowerCase().includes(lowerQuery)
      ) {
        results.push({ ...cmd, category: category.name });
      }
    });
  });

  return results;
}

module.exports = {
  getAllCommands,
  getCommandsByCategory,
  searchCommands,
};
