/**
 * Component Indexer for React/Vue projects
 * Detects and indexes custom UI components to help AI prefer existing components
 */

const fs = require('fs');
const path = require('path');

const REACT_EXTENSIONS = ['.tsx', '.jsx', '.js'];
const VUE_EXTENSION = '.vue';
const COMPONENT_DIRS = ['components', 'ui', 'shared', 'common', 'atoms', 'molecules', 'organisms'];

/**
 * Extract React component exports from file content
 */
function extractReactComponents(content, filePath) {
  const components = [];
  const fileName = path.basename(filePath, path.extname(filePath));
  const specialNames = new Set();
  let match;

  // Detect forwardRef components FIRST: export const Button = forwardRef(
  const forwardRefPattern = /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*=\s*(?:React\.)?forwardRef/g;
  while ((match = forwardRefPattern.exec(content)) !== null) {
    components.push({
      name: match[1],
      type: 'forwardRef',
      file: filePath,
    });
    specialNames.add(match[1]);
  }

  // Detect memo components: export const Button = memo(
  const memoPattern = /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*=\s*(?:React\.)?memo/g;
  while ((match = memoPattern.exec(content)) !== null) {
    if (!specialNames.has(match[1])) {
      components.push({
        name: match[1],
        type: 'memo',
        file: filePath,
      });
      specialNames.add(match[1]);
    }
  }

  // Named function exports: export function Button() or export const Button =
  // Skip names already detected as forwardRef/memo
  const namedExportPattern = /export\s+(?:const|function|class)\s+([A-Z][A-Za-z0-9]*)/g;
  while ((match = namedExportPattern.exec(content)) !== null) {
    if (!specialNames.has(match[1])) {
      components.push({
        name: match[1],
        type: 'named',
        file: filePath,
      });
    }
  }

  // Default exports with named function: export default function Button()
  const defaultNamedPattern = /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/g;
  while ((match = defaultNamedPattern.exec(content)) !== null) {
    components.push({
      name: match[1],
      type: 'default',
      file: filePath,
    });
  }

  // Default exports (unnamed) - use filename as component name
  if (/export\s+default\s+(?:function\s*\(|class\s*\{|\(\s*(?:props|\{))/.test(content)) {
    if (!components.some(c => c.type === 'default')) {
      components.push({
        name: fileName,
        type: 'default-inferred',
        file: filePath,
      });
    }
  }

  return components;
}

/**
 * Extract props from React TypeScript component
 */
function extractReactProps(content, componentName) {
  const props = [];

  // Interface/type props: interface ButtonProps { ... } or type ButtonProps = { ... }
  const propsTypeName = `${componentName}Props`;
  const interfacePattern = new RegExp(
    `(?:interface|type)\\s+${propsTypeName}\\s*(?:=\\s*)?\\{([^}]+)\\}`,
    's'
  );
  const interfaceMatch = content.match(interfacePattern);

  if (interfaceMatch) {
    const propsBody = interfaceMatch[1];
    // Extract prop names: propName: type or propName?: type
    const propPattern = /(\w+)\s*\??\s*:/g;
    let propMatch;
    while ((propMatch = propPattern.exec(propsBody)) !== null) {
      if (!['children', 'className', 'style', 'key', 'ref'].includes(propMatch[1])) {
        props.push(propMatch[1]);
      }
    }
  }

  // Inline destructured props: function Button({ label, onClick, disabled })
  const destructuredPattern = new RegExp(
    `(?:function|const)\\s+${componentName}[^{]*\\(\\s*\\{([^}]+)\\}`,
    's'
  );
  const destructuredMatch = content.match(destructuredPattern);

  if (destructuredMatch && props.length === 0) {
    const propsBody = destructuredMatch[1];
    const propNames = propsBody.split(',').map(p => p.trim().split(/[=:]/)[0].trim()).filter(Boolean);
    propNames.forEach(name => {
      if (!['children', 'className', 'style', 'key', 'ref', '...'].includes(name) && !name.startsWith('...')) {
        props.push(name);
      }
    });
  }

  return [...new Set(props)];
}

/**
 * Extract Vue component info from SFC
 */
function extractVueComponent(content, filePath) {
  const fileName = path.basename(filePath, '.vue');
  const component = {
    name: fileName,
    type: 'sfc',
    file: filePath,
    props: [],
  };

  // Check for explicit name in options API: name: 'ComponentName'
  const nameMatch = content.match(/name\s*:\s*['"]([^'"]+)['"]/);
  if (nameMatch) {
    component.name = nameMatch[1];
  }

  // Script setup with defineProps - TypeScript generic syntax: defineProps<{ prop: type }>()
  const definePropsGenericMatch = content.match(/defineProps\s*<\s*\{([^}]+)\}\s*>/s);
  if (definePropsGenericMatch) {
    const propsBody = definePropsGenericMatch[1];
    // TypeScript prop syntax: propName: type or propName?: type
    const propPattern = /(\w+)\s*\??:/g;
    let propMatch;
    while ((propMatch = propPattern.exec(propsBody)) !== null) {
      component.props.push(propMatch[1]);
    }
  }

  // Script setup with defineProps - runtime syntax: defineProps({ prop: Type })
  const definePropsMatch = content.match(/defineProps\s*\(\s*(?:\{([^}]+)\}|\[([^\]]+)\])/s);
  if (definePropsMatch && component.props.length === 0) {
    const propsBody = definePropsMatch[1] || definePropsMatch[2];
    if (propsBody) {
      // Object syntax: { label: String, disabled: Boolean }
      const propPattern = /(\w+)\s*:/g;
      let propMatch;
      while ((propMatch = propPattern.exec(propsBody)) !== null) {
        component.props.push(propMatch[1]);
      }
      // Array syntax: ['label', 'disabled']
      const arrayPropPattern = /['"](\w+)['"]/g;
      while ((propMatch = arrayPropPattern.exec(propsBody)) !== null) {
        if (!component.props.includes(propMatch[1])) {
          component.props.push(propMatch[1]);
        }
      }
    }
  }

  // Options API props
  const optionsPropsMatch = content.match(/props\s*:\s*(?:\{([^}]+)\}|\[([^\]]+)\])/s);
  if (optionsPropsMatch && component.props.length === 0) {
    const propsBody = optionsPropsMatch[1] || optionsPropsMatch[2];
    if (propsBody) {
      const propPattern = /(\w+)\s*:/g;
      let propMatch;
      while ((propMatch = propPattern.exec(propsBody)) !== null) {
        component.props.push(propMatch[1]);
      }
      const arrayPropPattern = /['"](\w+)['"]/g;
      while ((propMatch = arrayPropPattern.exec(propsBody)) !== null) {
        if (!component.props.includes(propMatch[1])) {
          component.props.push(propMatch[1]);
        }
      }
    }
  }

  return component;
}

/**
 * Detect design system presence
 */
function detectDesignSystem(cwd, roots) {
  const signals = {
    storybook: false,
    tailwind: false,
    cssModules: false,
    styledComponents: false,
    emotion: false,
    customTheme: false,
  };

  // Storybook
  if (fs.existsSync(path.join(cwd, '.storybook'))) {
    signals.storybook = true;
  }

  // Tailwind
  if (fs.existsSync(path.join(cwd, 'tailwind.config.js')) ||
      fs.existsSync(path.join(cwd, 'tailwind.config.ts')) ||
      fs.existsSync(path.join(cwd, 'tailwind.config.cjs'))) {
    signals.tailwind = true;
  }

  // Check package.json for styled-components/emotion
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['styled-components']) signals.styledComponents = true;
      if (deps['@emotion/react'] || deps['@emotion/styled']) signals.emotion = true;
    } catch {
      // ignore
    }
  }

  // Custom theme files
  const themeFiles = ['theme.ts', 'theme.js', 'theme.json', 'tokens.ts', 'tokens.js', 'tokens.json'];
  for (const root of roots) {
    for (const file of themeFiles) {
      if (fs.existsSync(path.join(cwd, root, file))) {
        signals.customTheme = true;
        break;
      }
    }
  }

  return signals;
}

/**
 * Find component directories in project
 */
function findComponentRoots(cwd, frontendRoots = ['.']) {
  const roots = [];

  const searchDirs = frontendRoots.length > 0 ? frontendRoots : ['.'];

  for (const base of searchDirs) {
    const basePath = path.join(cwd, base);
    if (!fs.existsSync(basePath)) continue;

    for (const dir of COMPONENT_DIRS) {
      const fullPath = path.join(basePath, dir);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        roots.push(path.posix.join(base, dir).replace(/^\.\//, ''));
      }
    }

    // Also check src/components, src/ui, etc.
    const srcPath = path.join(basePath, 'src');
    if (fs.existsSync(srcPath)) {
      for (const dir of COMPONENT_DIRS) {
        const fullPath = path.join(srcPath, dir);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          roots.push(path.posix.join(base, 'src', dir).replace(/^\.\//, ''));
        }
      }
    }
  }

  return [...new Set(roots)];
}

/**
 * Recursively list files in directory
 */
function listFilesRecursive(dir, extensions) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '__tests__', '__snapshots__'].includes(entry.name)) {
        results.push(...listFilesRecursive(fullPath, extensions));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Index all React components in project
 */
function indexReactComponents(cwd, frontendRoots = ['.']) {
  const componentRoots = findComponentRoots(cwd, frontendRoots);
  const allComponents = [];

  for (const root of componentRoots) {
    const rootPath = path.join(cwd, root);
    const files = listFilesRecursive(rootPath, REACT_EXTENSIONS);

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(cwd, filePath).replace(/\\/g, '/');
        const components = extractReactComponents(content, relativePath);

        for (const component of components) {
          const props = extractReactProps(content, component.name);
          allComponents.push({
            ...component,
            props: props.slice(0, 10), // Limit to 10 most relevant props
            root,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return {
    framework: 'react',
    componentRoots,
    components: allComponents.sort((a, b) => a.name.localeCompare(b.name)),
    designSystem: detectDesignSystem(cwd, componentRoots),
  };
}

/**
 * Index all Vue components in project
 */
function indexVueComponents(cwd, frontendRoots = ['.']) {
  const componentRoots = findComponentRoots(cwd, frontendRoots);
  const allComponents = [];

  for (const root of componentRoots) {
    const rootPath = path.join(cwd, root);
    const files = listFilesRecursive(rootPath, [VUE_EXTENSION]);

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(cwd, filePath).replace(/\\/g, '/');
        const component = extractVueComponent(content, relativePath);
        component.root = root;
        allComponents.push(component);
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return {
    framework: 'vue',
    componentRoots,
    components: allComponents.sort((a, b) => a.name.localeCompare(b.name)),
    designSystem: detectDesignSystem(cwd, componentRoots),
  };
}

/**
 * Build component index for project
 */
function buildComponentIndex(cwd, inventory) {
  const frontendFrameworks = inventory?.frontend?.frameworks || [];
  const frontendRoots = inventory?.frontend?.roots || ['.'];

  let index = null;

  if (frontendFrameworks.includes('react') || frontendFrameworks.includes('next')) {
    index = indexReactComponents(cwd, frontendRoots);
  } else if (frontendFrameworks.includes('vue')) {
    index = indexVueComponents(cwd, frontendRoots);
  } else {
    // Try to detect from file presence
    const hasReact = fs.existsSync(path.join(cwd, 'src', 'components')) ||
                     fs.existsSync(path.join(cwd, 'components'));
    const hasVue = listFilesRecursive(cwd, ['.vue']).length > 0;

    if (hasVue) {
      index = indexVueComponents(cwd, frontendRoots);
    } else if (hasReact) {
      index = indexReactComponents(cwd, frontendRoots);
    }
  }

  if (!index) {
    return {
      generatedAt: new Date().toISOString(),
      framework: null,
      componentRoots: [],
      components: [],
      designSystem: {},
      preferenceHint: null,
    };
  }

  // Generate preference hint for AI
  const componentNames = index.components.slice(0, 20).map(c => c.name);
  const preferenceHint = componentNames.length > 0
    ? `Prefer existing components: ${componentNames.join(', ')}`
    : null;

  return {
    generatedAt: new Date().toISOString(),
    ...index,
    preferenceHint,
  };
}

/**
 * Save component index artifact
 */
function saveComponentIndex(cwd, inventory) {
  const index = buildComponentIndex(cwd, inventory);
  const outputPath = path.join(cwd, '.grabby', 'component.index.json');

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2) + '\n', 'utf8');

  return { index, outputPath };
}

module.exports = {
  extractReactComponents,
  extractReactProps,
  extractVueComponent,
  detectDesignSystem,
  findComponentRoots,
  indexReactComponents,
  indexVueComponents,
  buildComponentIndex,
  saveComponentIndex,
};
