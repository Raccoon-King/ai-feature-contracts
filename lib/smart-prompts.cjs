/**
 * Smart prompts for context-aware interview questions
 * Analyzes project structure and existing contracts to generate better questions
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect project type from files
 */
function detectProjectType(cwd) {
  const indicators = {
    react: ['package.json', 'src/App.jsx', 'src/App.tsx', 'src/index.jsx', 'src/index.tsx'],
    nextjs: ['next.config.js', 'next.config.mjs', 'pages/', 'app/'],
    node: ['package.json', 'server.js', 'index.js', 'src/index.js'],
    typescript: ['tsconfig.json'],
    python: ['requirements.txt', 'setup.py', 'pyproject.toml', 'main.py'],
    go: ['go.mod', 'main.go'],
    rust: ['Cargo.toml', 'src/main.rs'],
  };

  const detected = [];
  for (const [type, files] of Object.entries(indicators)) {
    for (const file of files) {
      if (fs.existsSync(path.join(cwd, file))) {
        detected.push(type);
        break;
      }
    }
  }

  return [...new Set(detected)];
}

/**
 * Get existing directories in project
 */
function getProjectDirs(cwd) {
  const commonDirs = ['src', 'lib', 'app', 'pages', 'components', 'hooks', 'services', 'utils', 'tests', 'spec', '__tests__', 'api', 'server', 'client', 'public', 'assets', 'styles'];
  return commonDirs.filter(dir => fs.existsSync(path.join(cwd, dir)));
}

/**
 * Load existing contracts for context
 */
function loadExistingContracts(contractsDir) {
  if (!fs.existsSync(contractsDir)) return [];

  return fs.readdirSync(contractsDir)
    .filter(f => f.endsWith('.fc.md'))
    .map(file => {
      const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
      const titleMatch = content.match(/^# FC:\s+(.+)$/m);
      const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
      return {
        file,
        title: titleMatch?.[1] || file,
        status: statusMatch?.[1] || 'unknown',
      };
    });
}

/**
 * Generate context-aware prompts
 */
function generateSmartPrompts(cwd, contractsDir, taskDescription = '') {
  const projectTypes = detectProjectType(cwd);
  const projectDirs = getProjectDirs(cwd);
  const existingContracts = loadExistingContracts(contractsDir);
  const taskLower = taskDescription.toLowerCase();

  const prompts = {
    scope: [],
    directories: [],
    files: [],
    dependencies: [],
    security: [],
    testing: [],
  };

  // Scope prompts based on task type
  if (taskLower.includes('api') || taskLower.includes('endpoint')) {
    prompts.scope.push(
      'What HTTP methods does this endpoint support?',
      'What request/response format? (JSON, form-data, etc.)',
      'Does this require authentication?',
    );
  } else if (taskLower.includes('component') || taskLower.includes('ui')) {
    prompts.scope.push(
      'Is this a presentational or container component?',
      'Does it need to manage local state?',
      'What props should it accept?',
    );
  } else if (taskLower.includes('refactor')) {
    prompts.scope.push(
      'What specific code smells are you addressing?',
      'Should this maintain backward compatibility?',
      'Are there performance improvements expected?',
    );
  }

  // Directory prompts based on existing structure
  if (projectDirs.length > 0) {
    prompts.directories.push(`Detected directories: ${projectDirs.join(', ')}`);
    if (projectDirs.includes('src')) {
      prompts.directories.push('Should new files go in src/ subdirectories?');
    }
    if (projectDirs.includes('tests') || projectDirs.includes('__tests__')) {
      prompts.directories.push('Tests detected. Include test files in scope?');
    }
  }

  // File prompts based on project type
  if (projectTypes.includes('typescript')) {
    prompts.files.push('Use TypeScript (.ts/.tsx) for new files');
    prompts.files.push('Update types in src/types.ts if needed');
  }
  if (projectTypes.includes('react')) {
    prompts.files.push('Follow React component naming (PascalCase)');
    if (projectDirs.includes('hooks')) {
      prompts.files.push('Custom hooks go in hooks/ directory');
    }
  }

  // Dependency prompts
  if (projectTypes.includes('node') || projectTypes.includes('react')) {
    prompts.dependencies.push('Check package.json for existing dependencies first');
    prompts.dependencies.push('Run npm audit before adding new packages');
  }

  // Security prompts based on task
  if (taskLower.includes('auth') || taskLower.includes('login') || taskLower.includes('user')) {
    prompts.security.push('Validate all user input');
    prompts.security.push('Hash passwords with bcrypt');
    prompts.security.push('Use secure session management');
  }
  if (taskLower.includes('api') || taskLower.includes('data')) {
    prompts.security.push('Use parameterized queries');
    prompts.security.push('Sanitize output to prevent XSS');
  }

  // Testing prompts
  if (projectDirs.includes('tests') || projectDirs.includes('__tests__')) {
    prompts.testing.push('Write unit tests for new functions');
    prompts.testing.push('Aim for 80%+ coverage');
  }
  if (projectTypes.includes('react')) {
    prompts.testing.push('Use React Testing Library for components');
  }

  // Context from existing contracts
  if (existingContracts.length > 0) {
    const recent = existingContracts.slice(-3);
    prompts.context = `Recent contracts: ${recent.map(c => c.title).join(', ')}`;
  }

  return {
    projectTypes,
    projectDirs,
    existingContracts: existingContracts.length,
    prompts,
  };
}

/**
 * Get interview questions for a specific contract section
 */
function getInterviewQuestions(section, context = {}) {
  const questions = {
    objective: [
      'What problem does this feature solve?',
      'Who is the primary user of this feature?',
      'What is the expected outcome?',
    ],
    scope: [
      'What are the core requirements?',
      'Are there any edge cases to handle?',
      'What should explicitly NOT be included?',
    ],
    files: [
      'What new files need to be created?',
      'Which existing files need modification?',
      'Are there any files that should NOT be touched?',
    ],
    dependencies: [
      'Are any new packages required?',
      'Can existing dependencies handle this?',
      'Any packages to explicitly avoid?',
    ],
    security: [
      'Does this handle user input?',
      'Is authentication/authorization needed?',
      'Are there any sensitive data concerns?',
    ],
    testing: [
      'What test scenarios are critical?',
      'Are integration tests needed?',
      'What coverage target?',
    ],
    doneWhen: [
      'What defines "done" for this feature?',
      'What acceptance criteria exist?',
      'How will this be verified?',
    ],
  };

  return questions[section] || [];
}

/**
 * Suggest contract field values based on context
 */
function suggestFieldValues(field, context = {}) {
  const { projectTypes = [], projectDirs = [], taskDescription = '' } = context;
  const suggestions = [];

  switch (field) {
    case 'directories.allowed':
      suggestions.push(...projectDirs.map(d => `${d}/`));
      if (projectDirs.includes('tests')) suggestions.push('tests/');
      break;

    case 'directories.restricted':
      suggestions.push('node_modules/', '.git/', '.env*', 'coverage/');
      break;

    case 'dependencies.banned':
      suggestions.push('moment', 'lodash', 'jquery');
      break;

    case 'testing.coverage':
      suggestions.push('80%+');
      break;
  }

  return suggestions;
}

module.exports = {
  detectProjectType,
  getProjectDirs,
  loadExistingContracts,
  generateSmartPrompts,
  getInterviewQuestions,
  suggestFieldValues,
};
