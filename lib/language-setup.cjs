/**
 * Language Setup Detection for Go, Python, Rust, and other languages
 * Understands project structure, tooling, and development patterns
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect Go project setup
 */
function detectGoSetup(cwd) {
  const goModPath = path.join(cwd, 'go.mod');
  if (!fs.existsSync(goModPath)) {
    return null;
  }

  const setup = {
    language: 'go',
    module: null,
    goVersion: null,
    structure: 'standard',
    packages: [],
    entrypoints: [],
    tooling: [],
    testFramework: 'go-test',
  };

  // Parse go.mod
  try {
    const goMod = fs.readFileSync(goModPath, 'utf8');
    const moduleMatch = goMod.match(/^module\s+(.+)$/m);
    if (moduleMatch) {
      setup.module = moduleMatch[1].trim();
    }
    const goVersionMatch = goMod.match(/^go\s+(\d+\.\d+(?:\.\d+)?)$/m);
    if (goVersionMatch) {
      setup.goVersion = goVersionMatch[1];
    }
  } catch {
    // ignore
  }

  // Detect standard Go project structure
  const standardDirs = ['cmd', 'internal', 'pkg', 'api', 'web', 'configs', 'scripts', 'build', 'deployments'];
  const detectedDirs = [];
  for (const dir of standardDirs) {
    if (fs.existsSync(path.join(cwd, dir))) {
      detectedDirs.push(dir);
    }
  }

  if (detectedDirs.includes('cmd') && detectedDirs.includes('internal')) {
    setup.structure = 'standard-layout';
  } else if (detectedDirs.includes('cmd')) {
    setup.structure = 'cmd-layout';
  } else if (fs.existsSync(path.join(cwd, 'main.go'))) {
    setup.structure = 'flat';
  }

  // Find cmd/* entrypoints
  const cmdPath = path.join(cwd, 'cmd');
  if (fs.existsSync(cmdPath)) {
    try {
      const entries = fs.readdirSync(cmdPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const mainPath = path.join(cmdPath, entry.name, 'main.go');
          if (fs.existsSync(mainPath)) {
            setup.entrypoints.push(`cmd/${entry.name}`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Root main.go
  if (fs.existsSync(path.join(cwd, 'main.go'))) {
    setup.entrypoints.push('.');
  }

  // Detect packages (internal/*, pkg/*)
  for (const pkgDir of ['internal', 'pkg']) {
    const pkgPath = path.join(cwd, pkgDir);
    if (fs.existsSync(pkgPath)) {
      try {
        const entries = fs.readdirSync(pkgPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            setup.packages.push(`${pkgDir}/${entry.name}`);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Detect tooling
  const toolingFiles = {
    'Makefile': 'make',
    'makefile': 'make',
    'GNUmakefile': 'make',
    'docker-compose.yml': 'docker-compose',
    'docker-compose.yaml': 'docker-compose',
    'Dockerfile': 'docker',
    '.air.toml': 'air',
    '.goreleaser.yml': 'goreleaser',
    '.goreleaser.yaml': 'goreleaser',
    'golangci.yml': 'golangci-lint',
    '.golangci.yml': 'golangci-lint',
    '.golangci.yaml': 'golangci-lint',
    'buf.yaml': 'buf',
    'buf.gen.yaml': 'buf',
  };

  for (const [file, tool] of Object.entries(toolingFiles)) {
    if (fs.existsSync(path.join(cwd, file))) {
      if (!setup.tooling.includes(tool)) {
        setup.tooling.push(tool);
      }
    }
  }

  return setup;
}

/**
 * Detect Python project setup
 */
function detectPythonSetup(cwd) {
  const hasPyproject = fs.existsSync(path.join(cwd, 'pyproject.toml'));
  const hasSetupPy = fs.existsSync(path.join(cwd, 'setup.py'));
  const hasRequirements = fs.existsSync(path.join(cwd, 'requirements.txt'));

  if (!hasPyproject && !hasSetupPy && !hasRequirements) {
    return null;
  }

  const setup = {
    language: 'python',
    package: null,
    pythonVersion: null,
    structure: 'flat',
    packages: [],
    entrypoints: [],
    tooling: [],
    testFramework: null,
    virtualEnv: null,
  };

  // Parse pyproject.toml
  if (hasPyproject) {
    try {
      const content = fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf8');

      // Project name
      const nameMatch = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
      if (nameMatch) {
        setup.package = nameMatch[1];
      }

      // Python version
      const pyVersionMatch = content.match(/requires-python\s*=\s*["']([^"']+)["']/);
      if (pyVersionMatch) {
        setup.pythonVersion = pyVersionMatch[1];
      }

      // Build system
      if (content.includes('[tool.poetry]')) {
        setup.tooling.push('poetry');
      }
      if (content.includes('[tool.hatch]')) {
        setup.tooling.push('hatch');
      }
      if (content.includes('[tool.pdm]')) {
        setup.tooling.push('pdm');
      }

      // Test framework
      if (content.includes('[tool.pytest]')) {
        setup.testFramework = 'pytest';
      }

      // Linting
      if (content.includes('[tool.ruff]')) {
        setup.tooling.push('ruff');
      }
      if (content.includes('[tool.black]')) {
        setup.tooling.push('black');
      }
      if (content.includes('[tool.mypy]')) {
        setup.tooling.push('mypy');
      }
    } catch {
      // ignore
    }
  }

  // Detect structure
  if (fs.existsSync(path.join(cwd, 'src'))) {
    const srcEntries = fs.readdirSync(path.join(cwd, 'src'), { withFileTypes: true });
    const pkgDirs = srcEntries.filter(e => e.isDirectory() && !e.name.startsWith('_'));
    if (pkgDirs.length > 0) {
      setup.structure = 'src-layout';
      setup.packages = pkgDirs.map(d => `src/${d.name}`);
    }
  } else {
    // Look for package directories (contain __init__.py)
    try {
      const entries = fs.readdirSync(cwd, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !['tests', 'test', 'docs', 'scripts', 'venv', '.venv', 'node_modules'].includes(entry.name)) {
          if (fs.existsSync(path.join(cwd, entry.name, '__init__.py'))) {
            setup.packages.push(entry.name);
          }
        }
      }
      if (setup.packages.length > 0) {
        setup.structure = 'flat';
      }
    } catch {
      // ignore
    }
  }

  // Detect entrypoints
  const mainFiles = ['main.py', 'app.py', 'cli.py', '__main__.py'];
  for (const file of mainFiles) {
    if (fs.existsSync(path.join(cwd, file))) {
      setup.entrypoints.push(file);
    }
  }

  // Check for manage.py (Django)
  if (fs.existsSync(path.join(cwd, 'manage.py'))) {
    setup.entrypoints.push('manage.py');
    setup.tooling.push('django');
  }

  // Detect virtual env
  const venvDirs = ['venv', '.venv', 'env', '.env'];
  for (const dir of venvDirs) {
    const venvPath = path.join(cwd, dir);
    if (fs.existsSync(venvPath) && fs.existsSync(path.join(venvPath, 'pyvenv.cfg'))) {
      setup.virtualEnv = dir;
      break;
    }
  }

  // Detect additional tooling
  const toolingFiles = {
    'Makefile': 'make',
    'docker-compose.yml': 'docker-compose',
    'docker-compose.yaml': 'docker-compose',
    'Dockerfile': 'docker',
    'tox.ini': 'tox',
    'pytest.ini': 'pytest',
    'conftest.py': 'pytest',
    '.pre-commit-config.yaml': 'pre-commit',
    'noxfile.py': 'nox',
  };

  for (const [file, tool] of Object.entries(toolingFiles)) {
    if (fs.existsSync(path.join(cwd, file))) {
      if (!setup.tooling.includes(tool)) {
        setup.tooling.push(tool);
      }
    }
  }

  // Test framework fallback
  if (!setup.testFramework) {
    if (fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'conftest.py'))) {
      setup.testFramework = 'pytest';
    } else if (fs.existsSync(path.join(cwd, 'tests')) || fs.existsSync(path.join(cwd, 'test'))) {
      setup.testFramework = 'unittest';
    }
  }

  return setup;
}

/**
 * Detect Rust project setup
 */
function detectRustSetup(cwd) {
  const cargoTomlPath = path.join(cwd, 'Cargo.toml');
  if (!fs.existsSync(cargoTomlPath)) {
    return null;
  }

  const setup = {
    language: 'rust',
    crate: null,
    rustVersion: null,
    isWorkspace: false,
    members: [],
    structure: 'binary',
    tooling: [],
    testFramework: 'cargo-test',
  };

  // Parse Cargo.toml
  try {
    const content = fs.readFileSync(cargoTomlPath, 'utf8');

    // Check for workspace
    if (content.includes('[workspace]')) {
      setup.isWorkspace = true;
      setup.structure = 'workspace';

      // Parse workspace members
      const membersMatch = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
      if (membersMatch) {
        const membersStr = membersMatch[1];
        const memberPattern = /["']([^"']+)["']/g;
        let match;
        while ((match = memberPattern.exec(membersStr)) !== null) {
          // Handle wildcards
          if (match[1].includes('*')) {
            const baseDir = match[1].replace('/*', '').replace('*', '');
            const basePath = path.join(cwd, baseDir);
            if (fs.existsSync(basePath)) {
              const entries = fs.readdirSync(basePath, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory() && fs.existsSync(path.join(basePath, entry.name, 'Cargo.toml'))) {
                  setup.members.push(`${baseDir}/${entry.name}`);
                }
              }
            }
          } else {
            setup.members.push(match[1]);
          }
        }
      }
    }

    // Package name
    const nameMatch = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
    if (nameMatch) {
      setup.crate = nameMatch[1];
    }

    // Rust version
    const versionMatch = content.match(/rust-version\s*=\s*["']([^"']+)["']/);
    if (versionMatch) {
      setup.rustVersion = versionMatch[1];
    }
  } catch {
    // ignore
  }

  // Detect structure
  if (!setup.isWorkspace) {
    if (fs.existsSync(path.join(cwd, 'src', 'lib.rs'))) {
      if (fs.existsSync(path.join(cwd, 'src', 'main.rs'))) {
        setup.structure = 'mixed';
      } else {
        setup.structure = 'library';
      }
    } else if (fs.existsSync(path.join(cwd, 'src', 'main.rs'))) {
      setup.structure = 'binary';
    }
  }

  // Detect tooling
  const toolingFiles = {
    'Makefile': 'make',
    'docker-compose.yml': 'docker-compose',
    'docker-compose.yaml': 'docker-compose',
    'Dockerfile': 'docker',
    'rustfmt.toml': 'rustfmt',
    '.rustfmt.toml': 'rustfmt',
    'clippy.toml': 'clippy',
    '.clippy.toml': 'clippy',
    'deny.toml': 'cargo-deny',
    'Cross.toml': 'cross',
  };

  for (const [file, tool] of Object.entries(toolingFiles)) {
    if (fs.existsSync(path.join(cwd, file))) {
      if (!setup.tooling.includes(tool)) {
        setup.tooling.push(tool);
      }
    }
  }

  return setup;
}

/**
 * Detect Java/Kotlin project setup
 */
function detectJavaSetup(cwd) {
  const hasPomXml = fs.existsSync(path.join(cwd, 'pom.xml'));
  const hasBuildGradle = fs.existsSync(path.join(cwd, 'build.gradle')) ||
                         fs.existsSync(path.join(cwd, 'build.gradle.kts'));

  if (!hasPomXml && !hasBuildGradle) {
    return null;
  }

  const setup = {
    language: 'java',
    project: null,
    javaVersion: null,
    buildTool: hasBuildGradle ? 'gradle' : 'maven',
    isMultiModule: false,
    modules: [],
    structure: 'standard',
    tooling: [],
    testFramework: 'junit',
  };

  // Check for Kotlin
  if (fs.existsSync(path.join(cwd, 'build.gradle.kts')) ||
      fs.existsSync(path.join(cwd, 'src', 'main', 'kotlin'))) {
    setup.language = 'kotlin';
  }

  // Detect standard Maven/Gradle structure
  if (fs.existsSync(path.join(cwd, 'src', 'main', 'java')) ||
      fs.existsSync(path.join(cwd, 'src', 'main', 'kotlin'))) {
    setup.structure = 'standard';
  }

  // Detect multi-module
  if (hasBuildGradle && fs.existsSync(path.join(cwd, 'settings.gradle')) ||
      fs.existsSync(path.join(cwd, 'settings.gradle.kts'))) {
    try {
      const settings = fs.readFileSync(
        fs.existsSync(path.join(cwd, 'settings.gradle.kts'))
          ? path.join(cwd, 'settings.gradle.kts')
          : path.join(cwd, 'settings.gradle'),
        'utf8'
      );
      const includeMatch = settings.match(/include\s*\(([^)]+)\)/g);
      if (includeMatch) {
        setup.isMultiModule = true;
        for (const match of includeMatch) {
          const modulePattern = /["']:?([^"']+)["']/g;
          let m;
          while ((m = modulePattern.exec(match)) !== null) {
            setup.modules.push(m[1].replace(/^:/, ''));
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Detect tooling
  const toolingFiles = {
    'Makefile': 'make',
    'docker-compose.yml': 'docker-compose',
    'Dockerfile': 'docker',
    'checkstyle.xml': 'checkstyle',
    'spotbugs-exclude.xml': 'spotbugs',
    '.editorconfig': 'editorconfig',
  };

  for (const [file, tool] of Object.entries(toolingFiles)) {
    if (fs.existsSync(path.join(cwd, file))) {
      setup.tooling.push(tool);
    }
  }

  // Add build tool wrapper
  if (fs.existsSync(path.join(cwd, 'gradlew'))) {
    setup.tooling.push('gradle-wrapper');
  }
  if (fs.existsSync(path.join(cwd, 'mvnw'))) {
    setup.tooling.push('maven-wrapper');
  }

  return setup;
}

/**
 * Detect general project tooling
 */
function detectGeneralTooling(cwd) {
  const tooling = [];

  const toolingFiles = {
    'Makefile': 'make',
    'makefile': 'make',
    'justfile': 'just',
    'Taskfile.yml': 'task',
    'docker-compose.yml': 'docker-compose',
    'docker-compose.yaml': 'docker-compose',
    'Dockerfile': 'docker',
    '.dockerignore': 'docker',
    '.editorconfig': 'editorconfig',
    '.pre-commit-config.yaml': 'pre-commit',
    '.github/workflows': 'github-actions',
    '.gitlab-ci.yml': 'gitlab-ci',
    'Jenkinsfile': 'jenkins',
    '.circleci/config.yml': 'circleci',
    'k8s': 'kubernetes',
    'kubernetes': 'kubernetes',
    'helm': 'helm',
    'terraform': 'terraform',
    '.terraform': 'terraform',
    'pulumi': 'pulumi',
    'ansible': 'ansible',
    '.env.example': 'dotenv',
    '.env.sample': 'dotenv',
    '.env.template': 'dotenv',
  };

  for (const [file, tool] of Object.entries(toolingFiles)) {
    if (fs.existsSync(path.join(cwd, file))) {
      if (!tooling.includes(tool)) {
        tooling.push(tool);
      }
    }
  }

  return tooling;
}

/**
 * Build complete language setup for project
 */
function buildLanguageSetup(cwd) {
  const setup = {
    generatedAt: new Date().toISOString(),
    languages: [],
    primary: null,
    setups: {},
    generalTooling: detectGeneralTooling(cwd),
  };

  // Detect each language
  const goSetup = detectGoSetup(cwd);
  if (goSetup) {
    setup.languages.push('go');
    setup.setups.go = goSetup;
  }

  const pythonSetup = detectPythonSetup(cwd);
  if (pythonSetup) {
    setup.languages.push('python');
    setup.setups.python = pythonSetup;
  }

  const rustSetup = detectRustSetup(cwd);
  if (rustSetup) {
    setup.languages.push('rust');
    setup.setups.rust = rustSetup;
  }

  const javaSetup = detectJavaSetup(cwd);
  if (javaSetup) {
    setup.languages.push(javaSetup.language);
    setup.setups[javaSetup.language] = javaSetup;
  }

  // Determine primary language
  if (setup.languages.length === 1) {
    setup.primary = setup.languages[0];
  } else if (setup.languages.length > 1) {
    // Prefer by common priority: go > rust > python > java > kotlin
    const priority = ['go', 'rust', 'python', 'java', 'kotlin'];
    for (const lang of priority) {
      if (setup.languages.includes(lang)) {
        setup.primary = lang;
        break;
      }
    }
  }

  return setup;
}

/**
 * Save language setup artifact
 */
function saveLanguageSetup(cwd) {
  const setup = buildLanguageSetup(cwd);

  // Only save if we detected any non-Node language
  if (setup.languages.length === 0) {
    return { setup, outputPath: null };
  }

  const outputPath = path.join(cwd, '.grabby', 'language.setup.json');

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(setup, null, 2) + '\n', 'utf8');

  return { setup, outputPath };
}

module.exports = {
  detectGoSetup,
  detectPythonSetup,
  detectRustSetup,
  detectJavaSetup,
  detectGeneralTooling,
  buildLanguageSetup,
  saveLanguageSetup,
};
