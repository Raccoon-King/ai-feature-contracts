/**
 * Contract Levels System
 * Manages system-level (global) and project-level contracts
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const { ensureDir, readYamlSafe, writeYamlAtomic } = require('./fs-utils.cjs');

// Global Grabby directory
const GLOBAL_GRABBY_DIR = path.join(os.homedir(), '.grabby');
const GLOBAL_CONTRACTS_DIR = path.join(GLOBAL_GRABBY_DIR, 'contracts');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_GRABBY_DIR, 'config.yaml');

const CONTRACT_LEVELS = {
  SYSTEM: 'system',
  PROJECT: 'project'
};

/**
 * Initialize global Grabby directory
 */
function initGlobalDir() {
  const dirs = [
    GLOBAL_GRABBY_DIR,
    GLOBAL_CONTRACTS_DIR,
    path.join(GLOBAL_GRABBY_DIR, 'templates')
  ];

  dirs.forEach(ensureDir);

  // Create default config if doesn't exist
  if (!fs.existsSync(GLOBAL_CONFIG_FILE)) {
    const defaultConfig = {
      version: '1.0',
      created: new Date().toISOString(),
      preferences: {
        defaultLevel: 'ask', // 'system', 'project', or 'ask'
        autoApplySystem: true,
        showSystemInList: true
      }
    };
    writeYamlAtomic(GLOBAL_CONFIG_FILE, defaultConfig);
  }

  return GLOBAL_GRABBY_DIR;
}

/**
 * Load global config
 */
function loadGlobalConfig() {
  initGlobalDir();
  return readYamlSafe(GLOBAL_CONFIG_FILE, {});
}

/**
 * Save global config
 */
function saveGlobalConfig(config) {
  initGlobalDir();
  writeYamlAtomic(GLOBAL_CONFIG_FILE, config);
}

/**
 * Get contract level from contract content
 */
function getContractLevel(content) {
  // Check for explicit level marker
  const levelMatch = content.match(/\*\*Level:\*\*\s*(system|project)/i);
  if (levelMatch) {
    return levelMatch[1].toLowerCase();
  }
  return null; // Unknown - needs to ask user
}

/**
 * Detect if contract should likely be system-level
 */
function detectLikelySystemContract(content) {
  const systemIndicators = [
    /all\s+projects/i,
    /every\s+project/i,
    /global\s+(standard|rule|requirement)/i,
    /company[\s-]wide/i,
    /organization[\s-]wide/i,
    /coding\s+standard/i,
    /security\s+(standard|requirement|policy)/i,
    /code\s+quality/i,
    /style\s+guide/i,
    /best\s+practice/i,
    /\bconvention\b/i
  ];

  const projectIndicators = [
    /this\s+project/i,
    /this\s+application/i,
    /this\s+feature/i,
    /specific\s+to/i,
    /src\//,
    /components\//,
    /pages\//,
    /api\//
  ];

  let systemScore = 0;
  let projectScore = 0;

  for (const pattern of systemIndicators) {
    if (pattern.test(content)) systemScore++;
  }

  for (const pattern of projectIndicators) {
    if (pattern.test(content)) projectScore++;
  }

  if (systemScore > projectScore + 1) {
    return { likely: CONTRACT_LEVELS.SYSTEM, confidence: 'high', systemScore, projectScore };
  } else if (projectScore > systemScore + 1) {
    return { likely: CONTRACT_LEVELS.PROJECT, confidence: 'high', systemScore, projectScore };
  } else if (systemScore > projectScore) {
    return { likely: CONTRACT_LEVELS.SYSTEM, confidence: 'low', systemScore, projectScore };
  } else if (projectScore > systemScore) {
    return { likely: CONTRACT_LEVELS.PROJECT, confidence: 'low', systemScore, projectScore };
  }

  return { likely: null, confidence: 'none', systemScore, projectScore };
}

/**
 * List system-level contracts
 */
function listSystemContracts() {
  initGlobalDir();

  if (!fs.existsSync(GLOBAL_CONTRACTS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(GLOBAL_CONTRACTS_DIR)
    .filter(f => f.endsWith('.fc.md'));

  return files.map(file => {
    const filePath = path.join(GLOBAL_CONTRACTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract ID and status
    const idMatch = content.match(/\*\*ID:\*\*\s*([A-Z]+-\d+)/);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
    const titleMatch = content.match(/^#\s+Feature Contract:\s*(.+)$/m);

    return {
      file,
      path: filePath,
      id: idMatch ? idMatch[1] : file.replace('.fc.md', ''),
      status: statusMatch ? statusMatch[1] : 'unknown',
      title: titleMatch ? titleMatch[1].trim() : file.replace('.fc.md', ''),
      level: CONTRACT_LEVELS.SYSTEM
    };
  });
}

/**
 * List project-level contracts
 */
function listProjectContracts(projectDir = process.cwd()) {
  const contractsDir = path.join(projectDir, 'contracts');

  if (!fs.existsSync(contractsDir)) {
    return [];
  }

  const files = fs.readdirSync(contractsDir)
    .filter(f => f.endsWith('.fc.md'));

  return files.map(file => {
    const filePath = path.join(contractsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    const idMatch = content.match(/\*\*ID:\*\*\s*([A-Z]+-\d+)/);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
    const titleMatch = content.match(/^#\s+Feature Contract:\s*(.+)$/m);

    return {
      file,
      path: filePath,
      id: idMatch ? idMatch[1] : file.replace('.fc.md', ''),
      status: statusMatch ? statusMatch[1] : 'unknown',
      title: titleMatch ? titleMatch[1].trim() : file.replace('.fc.md', ''),
      level: CONTRACT_LEVELS.PROJECT
    };
  });
}

/**
 * List all contracts (system + project)
 */
function listAllContracts(projectDir = process.cwd()) {
  const system = listSystemContracts();
  const project = listProjectContracts(projectDir);

  return {
    system,
    project,
    all: [...system, ...project]
  };
}

/**
 * Add a contract to system level
 */
function addToSystemLevel(contractPath) {
  initGlobalDir();

  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract not found: ${contractPath}`);
  }

  const fileName = path.basename(contractPath);
  const destPath = path.join(GLOBAL_CONTRACTS_DIR, fileName);

  // Read content and add level marker if not present
  let content = fs.readFileSync(contractPath, 'utf8');
  if (!content.includes('**Level:**')) {
    // Add level after Status line
    content = content.replace(
      /(\*\*Status:\*\*\s*\w+)/,
      '$1\n**Level:** system'
    );
  }

  fs.writeFileSync(destPath, content, 'utf8');

  return destPath;
}

/**
 * Remove a contract from system level
 */
function removeFromSystemLevel(contractName) {
  const filePath = path.join(GLOBAL_CONTRACTS_DIR, contractName);

  if (!fs.existsSync(filePath)) {
    // Try adding .fc.md extension
    const withExt = filePath + '.fc.md';
    if (fs.existsSync(withExt)) {
      fs.unlinkSync(withExt);
      return withExt;
    }
    throw new Error(`System contract not found: ${contractName}`);
  }

  fs.unlinkSync(filePath);
  return filePath;
}

/**
 * Get merged contract context (system + project rules)
 * Project rules override system rules
 */
function getMergedContext(projectDir = process.cwd()) {
  const { system, project } = listAllContracts(projectDir);

  const context = {
    security: [],
    quality: [],
    testing: [],
    directories: {
      allowed: [],
      restricted: ['node_modules/', '.env']
    },
    dependencies: {
      allowed: [],
      restricted: []
    },
    rules: []
  };

  // Process system contracts first
  for (const contract of system) {
    const content = fs.readFileSync(contract.path, 'utf8');
    mergeContractRules(context, content, 'system');
  }

  // Process project contracts (can override)
  for (const contract of project) {
    const content = fs.readFileSync(contract.path, 'utf8');
    mergeContractRules(context, content, 'project');
  }

  // Deduplicate arrays
  context.directories.allowed = [...new Set(context.directories.allowed)];
  context.directories.restricted = [...new Set(context.directories.restricted)];

  return context;
}

/**
 * Merge rules from a contract into context
 */
function mergeContractRules(context, content, source) {
  // Extract security requirements
  const securitySection = content.match(/## Security[^#]*(?=##|$)/s);
  if (securitySection) {
    const items = securitySection[0].match(/- \[[ x]\].+/g) || [];
    for (const item of items) {
      if (!context.security.includes(item)) {
        context.security.push({ rule: item, source });
      }
    }
  }

  // Extract directory rules
  const dirsSection = content.match(/## Directories[^#]*(?=##|$)/s);
  if (dirsSection) {
    const allowedMatch = dirsSection[0].match(/\*\*Allowed:\*\*\s*`([^`]+)`/);
    const restrictedMatch = dirsSection[0].match(/\*\*Restricted:\*\*\s*`([^`]+)`/);

    if (allowedMatch) {
      const dirs = allowedMatch[1].split(',').map(d => d.trim());
      context.directories.allowed.push(...dirs);
    }
    if (restrictedMatch) {
      const dirs = restrictedMatch[1].split(',').map(d => d.trim());
      context.directories.restricted.push(...dirs);
    }
  }

  // Extract testing requirements
  const testingSection = content.match(/## Testing[^#]*(?=##|$)/s);
  if (testingSection) {
    const items = testingSection[0].match(/- .+/g) || [];
    for (const item of items) {
      context.testing.push({ rule: item, source });
    }
  }
}

/**
 * Create default system contracts
 */
function createDefaultSystemContracts() {
  initGlobalDir();

  const defaults = [
    {
      name: 'security-standards.fc.md',
      content: `# Feature Contract: Security Standards

**ID:** SYS-001
**Status:** approved
**Level:** system
**Created:** ${new Date().toISOString().split('T')[0]}

## Objective

Define security requirements that apply to ALL projects.

## Scope

- Input validation on all user inputs
- Output encoding to prevent XSS
- Parameterized queries to prevent SQL injection
- No secrets in code or version control
- HTTPS for all external communications

## Security Checklist

- [ ] Validate all user inputs
- [ ] Escape/encode outputs
- [ ] Use parameterized queries
- [ ] No hardcoded secrets
- [ ] npm audit passes (no high/critical)
- [ ] Dependencies reviewed for security

## Directories

**Restricted:** \`node_modules/, .env, .env.*, *.pem, *.key\`

## Done When

- [ ] Security checklist completed for all features
- [ ] npm audit shows no high/critical vulnerabilities
`
    },
    {
      name: 'code-quality.fc.md',
      content: `# Feature Contract: Code Quality Standards

**ID:** SYS-002
**Status:** approved
**Level:** system
**Created:** ${new Date().toISOString().split('T')[0]}

## Objective

Define code quality requirements that apply to ALL projects.

## Scope

- TypeScript strict mode (no \`any\` types)
- ESLint passes with no warnings
- Functions under 50 lines
- 80%+ test coverage
- No console.log in production code
- Meaningful variable/function names

## Quality Checklist

- [ ] TypeScript strict mode enabled
- [ ] ESLint configured and passing
- [ ] Prettier for formatting
- [ ] Test coverage >= 80%
- [ ] No TODO comments in main branch

## Done When

- [ ] All quality checks pass
- [ ] CI/CD enforces quality gates
`
    }
  ];

  const created = [];

  for (const contract of defaults) {
    const filePath = path.join(GLOBAL_CONTRACTS_DIR, contract.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, contract.content, 'utf8');
      created.push(contract.name);
    }
  }

  return created;
}

/**
 * Check if should ask user about contract level
 */
function shouldAskLevel(content) {
  const explicitLevel = getContractLevel(content);
  if (explicitLevel) {
    return { ask: false, level: explicitLevel };
  }

  const detection = detectLikelySystemContract(content);
  if (detection.confidence === 'high') {
    return { ask: false, level: detection.likely, detected: true };
  }

  return { ask: true, detection };
}

/**
 * Format contracts list for display
 */
function formatContractsList(contracts, options = {}) {
  const { showLevel = true, groupByLevel = true } = options;

  if (contracts.system.length === 0 && contracts.project.length === 0) {
    return 'No contracts found.';
  }

  let output = '';

  if (groupByLevel) {
    if (contracts.system.length > 0) {
      output += '\n\x1b[36mSystem Contracts (Global)\x1b[0m\n';
      output += '─'.repeat(40) + '\n';
      for (const c of contracts.system) {
        const status = c.status === 'approved' ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m';
        output += `  ${status} ${c.id}: ${c.title}\n`;
      }
    }

    if (contracts.project.length > 0) {
      output += '\n\x1b[35mProject Contracts\x1b[0m\n';
      output += '─'.repeat(40) + '\n';
      for (const c of contracts.project) {
        const status = c.status === 'approved' ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m';
        output += `  ${status} ${c.id}: ${c.title}\n`;
      }
    }
  } else {
    for (const c of contracts.all) {
      const levelTag = showLevel ? `[${c.level}] ` : '';
      const status = c.status === 'approved' ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m';
      output += `  ${status} ${levelTag}${c.id}: ${c.title}\n`;
    }
  }

  return output;
}

module.exports = {
  CONTRACT_LEVELS,
  GLOBAL_GRABBY_DIR,
  GLOBAL_CONTRACTS_DIR,
  initGlobalDir,
  loadGlobalConfig,
  saveGlobalConfig,
  getContractLevel,
  detectLikelySystemContract,
  listSystemContracts,
  listProjectContracts,
  listAllContracts,
  addToSystemLevel,
  removeFromSystemLevel,
  getMergedContext,
  createDefaultSystemContracts,
  shouldAskLevel,
  formatContractsList
};
