/**
 * Grabby - Core Library
 * Exportable functions for testing and reuse
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { scoreContractComplexity, analyzeRisks, checkAntiPatterns } = require('./complexity.cjs');
const { analyzeContractDeps, checkFileConflicts } = require('./dependency-analyzer.cjs');
const { ensureDir, readJsonSafe, writeJsonAtomic, readYamlSafe } = require('./fs-utils.cjs');
const { codes: colors } = require('./colors.cjs');

// ============================================================================
// UTILITIES
// ============================================================================

let lastGeneratedMs = 0;
let sameMsCounter = 0;

const genId = () => {
  const now = Date.now();
  if (now === lastGeneratedMs) {
    sameMsCounter += 1;
  } else {
    lastGeneratedMs = now;
    sameMsCounter = 0;
  }
  const suffix = sameMsCounter === 0 ? '' : `-${sameMsCounter}`;
  return `FC-${now}${suffix}`;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const timestamp = () => new Date().toISOString();

const c = {
  error: (s) => `${colors.red}${s}${colors.reset}`,
  success: (s) => `${colors.green}${s}${colors.reset}`,
  warn: (s) => `${colors.yellow}${s}${colors.reset}`,
  info: (s) => `${colors.cyan}${s}${colors.reset}`,
  dim: (s) => `${colors.dim}${s}${colors.reset}`,
  bold: (s) => `${colors.bold}${s}${colors.reset}`,
  heading: (s) => `${colors.bold}${colors.cyan}${s}${colors.reset}`,
  agent: (s) => `${colors.bold}${colors.magenta}${s}${colors.reset}`,
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateContract(content) {
  const errors = [];
  const warnings = [];
  const suggestions = [];
  const checklistPattern = /^- \[(?: |x|X)\]/gm;

  // Check required sections
  const required = ['Objective', 'Scope', 'Directories', 'Files', 'Done When'];
  required.forEach(s => {
    if (!content.includes(`## ${s}`)) errors.push(`Missing section: ${s}`);
  });

  // Check restricted directories in Files section
  // Parse restricted dirs from the contract's Directories section
  const dirsSection = content.match(/## Directories[\s\S]*?(?=##|$)/)?.[0] || '';
  const restrictedMatch = dirsSection.match(/\*\*Restricted:\*\*\s*`([^`]+)`/);
  const restricted = restrictedMatch
    ? restrictedMatch[1].split(',').map(d => d.trim().replace(/`/g, ''))
    : ['node_modules/', '.env'];

  const filesSection = content.match(/## Files[\s\S]*?(?=##|$)/)?.[0] || '';
  const fileTableRows = filesSection.split('\n').filter(line => line.startsWith('|') && !line.includes('Action') && !line.includes('---'));
  const listedFilePaths = fileTableRows
    .map((row) => {
      const backticked = row.match(/`([^`]+)`/)?.[1];
      if (backticked) {
        return backticked;
      }
      const cells = row.split('|').map((cell) => cell.trim()).filter(Boolean);
      return cells[1] || '';
    })
    .filter(Boolean);
  const tracksContractArtifactsOnly = listedFilePaths.length > 0
    && listedFilePaths.every((filePath) => String(filePath).replace(/\\/g, '/').startsWith('contracts/'));
  restricted.forEach(r => {
    // Check if file paths in the table contain a restricted directory
    fileTableRows.forEach(row => {
      const pathMatch = row.match(/`([^`]+)`/);
      if (pathMatch && pathMatch[1].includes(r.replace('*', ''))) {
        errors.push(`Restricted directory in files: ${r}`);
      }
    });
  });

  // Check for banned dependencies in Allowed line
  const banned = ['moment', 'lodash', 'jquery'];
  const allowedLine = content.match(/- Allowed:.*$/m)?.[0] || '';
  banned.forEach(b => {
    if (allowedLine.toLowerCase().includes(b)) {
      errors.push(`Banned dependency: ${b}`);
    }
  });

  // Check for vague/unbounded terms
  const vagueTerms = ['improve', 'optimize', 'enhance', 'better', 'faster', 'refactor', 'clean up', 'fix issues'];
  const objectiveSection = content.match(/## Objective[\s\S]*?(?=##|$)/)?.[0] || '';
  const scopeSection = content.match(/## Scope[\s\S]*?(?=##|$)/)?.[0] || '';

  vagueTerms.forEach(term => {
    if (objectiveSection.toLowerCase().includes(term)) {
      warnings.push(`Vague term in Objective: "${term}" - add specific metrics`);
    }
    if (scopeSection.toLowerCase().includes(term)) {
      warnings.push(`Vague term in Scope: "${term}" - be more specific`);
    }
  });

  // Check scope size
  const scopeItems = (scopeSection.match(/^- .+$/gm) || []).length;
  if (scopeItems > 7) {
    errors.push(`Scope too large (${scopeItems} items) - max 7 recommended`);
  } else if (scopeItems > 5) {
    warnings.push(`Large scope (${scopeItems} items) - consider splitting`);
  }

  // Check file count
  const fileCount = (filesSection.match(/^\|[^|]+\|/gm) || []).length - 2;
  if (fileCount > 15) {
    errors.push(`Too many files (${fileCount}) - consider splitting contract`);
  } else if (fileCount > 10) {
    warnings.push(`Many files (${fileCount}) - consider phased implementation`);
  }

  // Check for test files
  const hasTestFile = listedFilePaths.some((filePath) => {
    const normalized = String(filePath).replace(/\\/g, '/').toLowerCase();
    return normalized.startsWith('tests/')
      || normalized.includes('/tests/')
      || normalized.includes('.test.')
      || normalized.includes('.spec.')
      || normalized.includes('test');
  });
  if (!hasTestFile && !tracksContractArtifactsOnly) {
    warnings.push('No test files in Files section');
  }

  // Check Done When section has checkboxes
  const doneWhenSection = content.match(/## Done When[\s\S]*?(?=##|$)/)?.[0] || '';
  const checkboxCount = (doneWhenSection.match(checklistPattern) || []).length;
  if (checkboxCount === 0) {
    warnings.push('Done When has no checkboxes - add verifiable criteria');
  } else if (checkboxCount < 3) {
    suggestions.push('Consider adding more Done When criteria');
  }

  // Warnings for missing optional sections
  if (!content.includes('## Testing')) {
    warnings.push('No testing section defined');
  }
  if (!content.includes('Context Refs')) {
    warnings.push('No context references defined');
  }
  if (!content.includes('## Non-Goals')) {
    suggestions.push('Consider adding Non-Goals section to clarify boundaries');
  }

  // Check for placeholder text
  const placeholders = ['[NAME]', '[ID]', '[TODO]', '[TBD]', '[FILL]'];
  placeholders.forEach(p => {
    if (content.includes(p)) {
      errors.push(`Placeholder not filled: ${p}`);
    }
  });

  // ============================================================================
  // SECURITY CHECKS
  // ============================================================================

  const hasSecuritySection = content.includes('## Security Considerations');
  if (!hasSecuritySection) {
    warnings.push('Missing Security Considerations section');
  } else {
    const securitySection = content.match(/## Security Considerations[\s\S]*?(?=##|$)/)?.[0] || '';
    const securityChecks = (securitySection.match(checklistPattern) || []).length;
    if (securityChecks === 0) {
      warnings.push('Security section has no checklist items');
    }
  }

  // Check for security-sensitive patterns in scope
  const securityPatterns = ['auth', 'login', 'password', 'token', 'credential', 'secret', 'api key', 'payment', 'credit card', 'ssn', 'pii'];
  const lowerContent = content.toLowerCase();
  const foundSecurityPatterns = securityPatterns.filter(p => lowerContent.includes(p));

  if (foundSecurityPatterns.length > 0 && !hasSecuritySection) {
    errors.push(`Security-sensitive feature (${foundSecurityPatterns.join(', ')}) requires Security Considerations section`);
  }

  // Check for dangerous patterns
  const dangerousPatterns = ['eval', 'child_process', 'vm', 'crypto'];
  const depsSection = content.match(/## Dependencies[\s\S]*?(?=##|$)/)?.[0] || '';
  dangerousPatterns.forEach(p => {
    if (depsSection.toLowerCase().includes(p) && depsSection.includes('Allowed')) {
      warnings.push(`Potentially dangerous dependency pattern: ${p} - ensure proper review`);
    }
  });

  // ============================================================================
  // CODE QUALITY CHECKS
  // ============================================================================

  const hasQualitySection = content.includes('## Code Quality');
  if (!hasQualitySection) {
    suggestions.push('Consider adding Code Quality checklist section');
  }

  const has80Coverage = doneWhenSection.includes('80%') || doneWhenSection.includes('80+');
  if (!has80Coverage) {
    warnings.push('Done When should include 80%+ coverage requirement');
  }

  const hasLintCheck = doneWhenSection.toLowerCase().includes('lint');
  if (!hasLintCheck) {
    warnings.push('Done When should include lint check');
  }

  if (foundSecurityPatterns.length > 0) {
    const hasAudit = content.includes('npm audit') || content.includes('security scan');
    if (!hasAudit) {
      warnings.push('Security-sensitive feature should include npm audit requirement');
    }
  }

  const looksLikeDbChange = /migration|schema|database|backfill|foreign key|cascade/i.test(lowerContent);
  if (looksLikeDbChange) {
    if (!/\*\*Data Change:\*\*\s*(yes|true)/i.test(content)) {
      warnings.push('DB-affecting feature should declare **Data Change:** yes');
    }
    if (!content.includes('## Data Impact')) {
      warnings.push('DB-affecting feature should include a Data Impact section');
    }
  }

  const looksLikeApiChange = /openapi|graphql|grpc|endpoint|api contract|payload shape|operation id|versioning|deprecation/i.test(lowerContent);
  if (looksLikeApiChange) {
    if (!/\*\*API Change:\*\*\s*(yes|true)/i.test(content)) {
      warnings.push('API-affecting feature should declare **API Change:** yes');
    }
    if (!content.includes('## API Impact')) {
      warnings.push('API-affecting feature should include an API Impact section');
    }
  }

  const looksLikeDependencyChange = /package\.json|package-lock\.json|yarn\.lock|pnpm-lock|lockfile|dependency upgrade|dependency policy|workspace dependency/i.test(lowerContent);
  if (looksLikeDependencyChange) {
    if (!/\*\*Dependency Change:\*\*\s*(yes|true)/i.test(content)) {
      warnings.push('Dependency-affecting feature should declare **Dependency Change:** yes');
    }
    if (!content.includes('## Dependency Impact')) {
      warnings.push('Dependency-affecting feature should include a Dependency Impact section');
    }
  }

  // ============================================================================
  // CHANGE ASSESSMENT VALIDATION
  // ============================================================================

  // Parse Files section for action types
  const fileActions = { create: 0, modify: 0, delete: 0 };
  fileTableRows.forEach((row) => {
    const lowerRow = row.toLowerCase();
    if (lowerRow.includes('**create**') || lowerRow.includes('| create |')) {
      fileActions.create += 1;
    } else if (lowerRow.includes('**modify**') || lowerRow.includes('| modify |')) {
      fileActions.modify += 1;
    } else if (lowerRow.includes('**delete**') || lowerRow.includes('| delete |')) {
      fileActions.delete += 1;
    }
  });

  // Check for Dependencies section
  const hasDependenciesSection = content.includes('## Dependencies');
  const dependenciesSection = content.match(/## Dependencies[\s\S]*?(?=\n##|$)/)?.[0] || '';
  const depTableRows = dependenciesSection.split('\n').filter(line => line.startsWith('|') && !line.includes('Action') && !line.includes('---'));
  const depActions = { add: 0, update: 0, remove: 0 };
  depTableRows.forEach((row) => {
    const lowerRow = row.toLowerCase();
    if (lowerRow.includes('**add**') || lowerRow.includes('| add |')) {
      depActions.add += 1;
    } else if (lowerRow.includes('**update**') || lowerRow.includes('| update |')) {
      depActions.update += 1;
    } else if (lowerRow.includes('**remove**') || lowerRow.includes('| remove |')) {
      depActions.remove += 1;
    }
  });

  // Check for Assets section
  const hasAssetsSection = content.includes('## Assets');
  const assetsSection = content.match(/## Assets[\s\S]*?(?=\n##|$)/)?.[0] || '';
  const assetTableRows = assetsSection.split('\n').filter(line => line.startsWith('|') && !line.includes('Action') && !line.includes('---'));
  const assetActions = { create: 0, modify: 0, delete: 0 };
  assetTableRows.forEach((row) => {
    const lowerRow = row.toLowerCase();
    if (lowerRow.includes('**create**') || lowerRow.includes('| create |')) {
      assetActions.create += 1;
    } else if (lowerRow.includes('**modify**') || lowerRow.includes('| modify |')) {
      assetActions.modify += 1;
    } else if (lowerRow.includes('**delete**') || lowerRow.includes('| delete |')) {
      assetActions.delete += 1;
    }
  });

  // Check for Change Summary section
  const hasChangeSummary = content.includes('## Change Summary');
  if (!hasChangeSummary && !tracksContractArtifactsOnly) {
    suggestions.push('Consider adding Change Summary section for clarity');
  }

  // Validate action types are explicit
  const unclearActionRows = fileTableRows.filter((row) => {
    const lowerRow = row.toLowerCase();
    return !lowerRow.includes('create') && !lowerRow.includes('modify') && !lowerRow.includes('delete') && !lowerRow.includes('---');
  });
  if (unclearActionRows.length > 0 && !tracksContractArtifactsOnly) {
    warnings.push(`${unclearActionRows.length} file(s) have unclear action type - use CREATE/MODIFY/DELETE`);
  }

  // Calculate totals for stats
  const changeStats = {
    files: fileActions,
    dependencies: depActions,
    assets: assetActions,
    total: {
      create: fileActions.create + assetActions.create,
      modify: fileActions.modify + assetActions.modify,
      delete: fileActions.delete + assetActions.delete,
      newDeps: depActions.add,
    },
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    stats: {
      scopeItems,
      fileCount,
      checkboxCount,
      hasSecuritySection,
      hasQualitySection,
      securitySensitive: foundSecurityPatterns.length > 0,
      tracksContractArtifactsOnly,
      hasDependenciesSection,
      hasAssetsSection,
      hasChangeSummary,
      changeStats,
    }
  };
}

/**
 * Enhanced validation with complexity scoring and dependency analysis
 */
function validateContractStrict(content, cwd = process.cwd()) {
  // Run basic validation first
  const basic = validateContract(content);

  // Add complexity scoring
  const complexity = scoreContractComplexity(content);
  if (complexity.score > 7) {
    basic.warnings.push(`High complexity score (${complexity.score}/10) - ${complexity.level}`);
  }
  for (const rec of complexity.recommendations) {
    basic.suggestions.push(rec);
  }

  // Add risk analysis
  const risks = analyzeRisks(content);
  for (const risk of risks.risks) {
    if (risk.severity === 'high') {
      basic.warnings.push(`Risk: ${risk.risk}`);
    } else if (risk.severity === 'medium') {
      basic.suggestions.push(`Risk: ${risk.risk}`);
    }
  }

  // Add anti-pattern checks
  const antiPatterns = checkAntiPatterns(content);
  for (const issue of antiPatterns) {
    if (issue.type === 'broad-scope' || issue.type === 'no-criteria') {
      basic.errors.push(issue.message);
    } else {
      basic.warnings.push(issue.message);
    }
  }

  // Add dependency analysis
  const deps = analyzeContractDeps(content, cwd);
  for (const warning of deps.warnings) {
    if (warning.type === 'circular-dependency') {
      basic.errors.push(warning.message);
    } else {
      basic.warnings.push(warning.message);
    }
  }

  // Check file conflicts
  const conflicts = checkFileConflicts(content, cwd);
  for (const conflict of conflicts) {
    basic.warnings.push(conflict.message);
  }

  return {
    ...basic,
    valid: basic.errors.length === 0,
    complexity,
    risks,
    dependencies: deps,
    conflicts,
  };
}

// ============================================================================
// AGENT FUNCTIONS
// ============================================================================

function loadAgent(agentsDir, name) {
  const agentFile = path.join(agentsDir, `${name}.agent.yaml`);
  if (!fs.existsSync(agentFile)) {
    const aliases = {
      'analyst': 'analyst',
      'architect': 'contract-architect',
      'validator': 'scope-validator',
      'strategist': 'plan-strategist',
      'dev': 'dev-agent',
      'tester': 'test-engineer',
      'auditor': 'auditor',
      'quick': 'quick-flow'
    };
    const aliased = aliases[name];
    if (aliased) {
      const aliasedFile = path.join(agentsDir, `${aliased}.agent.yaml`);
      if (fs.existsSync(aliasedFile)) {
        return yaml.parse(fs.readFileSync(aliasedFile, 'utf8'));
      }
    }
    return null;
  }
  return yaml.parse(fs.readFileSync(agentFile, 'utf8'));
}

function listAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) {
    return [];
  }
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.yaml'));
  return files.map(f => {
    const content = yaml.parse(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
    return {
      file: f,
      id: content.agent?.metadata?.id || f,
      name: content.agent?.metadata?.name || 'Unknown',
      title: content.agent?.metadata?.title || 'Unknown',
      icon: content.agent?.metadata?.icon || '?',
      capabilities: content.agent?.metadata?.capabilities || ''
    };
  });
}

// ============================================================================
// WORKFLOW FUNCTIONS
// ============================================================================

function loadWorkflow(workflowsDir, workflowPath) {
  let fullPath = workflowPath;
  if (!path.isAbsolute(workflowPath)) {
    fullPath = path.join(workflowsDir, workflowPath);
  }
  if (!fs.existsSync(fullPath)) {
    const inWorkflows = path.join(workflowsDir, workflowPath, 'workflow.yaml');
    if (fs.existsSync(inWorkflows)) {
      fullPath = inWorkflows;
    } else {
      return null;
    }
  }
  return yaml.parse(fs.readFileSync(fullPath, 'utf8'));
}

function listWorkflows(workflowsDir) {
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }
  return fs.readdirSync(workflowsDir)
    .filter(f => fs.statSync(path.join(workflowsDir, f)).isDirectory())
    .map(f => {
      const workflowFile = path.join(workflowsDir, f, 'workflow.yaml');
      if (fs.existsSync(workflowFile)) {
        const content = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));
        return {
          name: f,
          ...content
        };
      }
      return { name: f };
    });
}

// ============================================================================
// PROGRESS FUNCTIONS
// ============================================================================

function saveProgress(progressDir, workflowName, data) {
  ensureDir(progressDir);
  const progressFile = path.join(progressDir, `${workflowName}.json`);
  const progress = {
    workflow: workflowName,
    timestamp: timestamp(),
    data
  };
  writeJsonAtomic(progressFile, progress);
  return progressFile;
}

function loadProgress(progressDir, workflowName) {
  const progressFile = path.join(progressDir, `${workflowName}.json`);
  return readJsonSafe(progressFile, null);
}

function clearProgress(progressDir, workflowName) {
  const progressFile = path.join(progressDir, `${workflowName}.json`);
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }
}

function listProgress(progressDir) {
  if (!fs.existsSync(progressDir)) {
    return [];
  }
  return fs.readdirSync(progressDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(progressDir, f), 'utf8'));
      return {
        file: f,
        workflow: data.workflow,
        timestamp: data.timestamp,
        step: data.data?.currentStep || 0
      };
    });
}

// ============================================================================
// CONTRACT FUNCTIONS
// ============================================================================

function createContract(templatesDir, contractsDir, name, templateName = 'contract') {
  const id = genId();
  const fileName = `${slug(name)}.fc.md`;
  const filePath = path.join(contractsDir, fileName);

  ensureDir(contractsDir);

  if (fs.existsSync(filePath)) {
    throw new Error(`Contract already exists: ${fileName}`);
  }

  const templateFile = path.join(templatesDir, `${templateName}.md`);
  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  const template = fs.readFileSync(templateFile, 'utf8');
  const content = template
    .replace(/\[NAME\]/g, name)
    .replace(/\[ID\]/g, id)
    .replace(/\[DATE\]/g, new Date().toISOString().split('T')[0])
    .replace(/\[FEATURE\]/g, name.replace(/\s+/g, ''));

  fs.writeFileSync(filePath, content);

  return { id, fileName, filePath };
}

function resolveContract(contractsDir, file) {
  if (!file) {
    throw new Error('No file specified');
  }

  if (fs.existsSync(file)) return path.resolve(file);

  const inContracts = path.join(contractsDir, file);
  if (fs.existsSync(inContracts)) return inContracts;

  const withExt = file.endsWith('.fc.md') ? file : `${file}.fc.md`;
  const withExtPath = path.join(contractsDir, withExt);
  if (fs.existsSync(withExtPath)) return withExtPath;

  throw new Error(`Contract not found: ${file}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Utilities
  genId,
  slug,
  timestamp,
  colors,
  c,

  // Validation
  validateContract,
  validateContractStrict,

  // Agents
  loadAgent,
  listAgents,

  // Workflows
  loadWorkflow,
  listWorkflows,

  // Progress
  saveProgress,
  loadProgress,
  clearProgress,
  listProgress,

  // Contracts
  createContract,
  resolveContract
};
