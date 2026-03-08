const {
  extractReactComponents,
  extractReactProps,
  extractVueComponent,
  detectDesignSystem,
  findComponentRoots,
} = require('../lib/component-indexer.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('component-indexer', () => {
  describe('extractReactComponents', () => {
    it('extracts named function exports', () => {
      const content = `
        export function Button() { return <button />; }
        export function Input() { return <input />; }
      `;
      const components = extractReactComponents(content, 'components/Button.tsx');
      expect(components).toHaveLength(2);
      expect(components[0].name).toBe('Button');
      expect(components[1].name).toBe('Input');
    });

    it('extracts named const exports', () => {
      const content = `
        export const Card = () => <div />;
        export const Modal = () => <div />;
      `;
      const components = extractReactComponents(content, 'components/Card.tsx');
      expect(components.some(c => c.name === 'Card')).toBe(true);
      expect(components.some(c => c.name === 'Modal')).toBe(true);
    });

    it('extracts default exports with name', () => {
      const content = `
        export default function Sidebar() { return <aside />; }
      `;
      const components = extractReactComponents(content, 'components/Sidebar.tsx');
      expect(components).toHaveLength(1);
      expect(components[0].name).toBe('Sidebar');
      expect(components[0].type).toBe('default');
    });

    it('extracts forwardRef components', () => {
      const content = `
        export const TextInput = forwardRef((props, ref) => <input ref={ref} />);
      `;
      const components = extractReactComponents(content, 'components/TextInput.tsx');
      expect(components.some(c => c.name === 'TextInput' && c.type === 'forwardRef')).toBe(true);
    });

    it('extracts memo components', () => {
      const content = `
        export const MemoizedList = memo(() => <ul />);
      `;
      const components = extractReactComponents(content, 'components/MemoizedList.tsx');
      expect(components.some(c => c.name === 'MemoizedList' && c.type === 'memo')).toBe(true);
    });

    it('infers name from filename for unnamed default exports', () => {
      const content = `
        export default function() { return <div />; }
      `;
      const components = extractReactComponents(content, 'components/Header.tsx');
      expect(components.some(c => c.name === 'Header' && c.type === 'default-inferred')).toBe(true);
    });

    it('ignores non-component exports', () => {
      const content = `
        export const buttonVariants = { primary: 'blue' };
        export function calculateTotal() { return 100; }
      `;
      const components = extractReactComponents(content, 'utils/helpers.ts');
      // Should not extract lowercase functions
      expect(components).toHaveLength(0);
    });
  });

  describe('extractReactProps', () => {
    it('extracts props from interface', () => {
      const content = `
        interface ButtonProps {
          label: string;
          onClick: () => void;
          disabled?: boolean;
          children: React.ReactNode;
        }
        export function Button(props: ButtonProps) { return <button />; }
      `;
      const props = extractReactProps(content, 'Button');
      expect(props).toContain('label');
      expect(props).toContain('onClick');
      expect(props).toContain('disabled');
      expect(props).not.toContain('children'); // common props filtered
    });

    it('extracts props from destructured parameters', () => {
      const content = `
        export function Card({ title, subtitle, onClose, className }) {
          return <div />;
        }
      `;
      const props = extractReactProps(content, 'Card');
      expect(props).toContain('title');
      expect(props).toContain('subtitle');
      expect(props).toContain('onClose');
      expect(props).not.toContain('className'); // common props filtered
    });

    it('handles type alias props', () => {
      const content = `
        type InputProps = {
          value: string;
          onChange: (val: string) => void;
          placeholder?: string;
        }
        export const Input = ({ value, onChange }: InputProps) => <input />;
      `;
      const props = extractReactProps(content, 'Input');
      expect(props).toContain('value');
      expect(props).toContain('onChange');
      expect(props).toContain('placeholder');
    });
  });

  describe('extractVueComponent', () => {
    it('extracts component from script setup with defineProps', () => {
      const content = `
        <script setup lang="ts">
        defineProps<{
          title: string;
          count: number;
        }>();
        </script>
        <template><div>{{ title }}</div></template>
      `;
      const component = extractVueComponent(content, 'components/Counter.vue');
      expect(component.name).toBe('Counter');
      expect(component.type).toBe('sfc');
      expect(component.props).toContain('title');
      expect(component.props).toContain('count');
    });

    it('extracts component from options API', () => {
      const content = `
        <script>
        export default {
          name: 'UserCard',
          props: {
            username: String,
            avatar: String,
          }
        }
        </script>
      `;
      const component = extractVueComponent(content, 'components/UserCard.vue');
      expect(component.name).toBe('UserCard');
      expect(component.props).toContain('username');
      expect(component.props).toContain('avatar');
    });

    it('extracts array-style props', () => {
      const content = `
        <script>
        export default {
          props: ['message', 'timestamp']
        }
        </script>
      `;
      const component = extractVueComponent(content, 'components/Toast.vue');
      expect(component.props).toContain('message');
      expect(component.props).toContain('timestamp');
    });
  });

  describe('detectDesignSystem', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'component-indexer-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('detects Storybook', () => {
      fs.mkdirSync(path.join(tempDir, '.storybook'));
      const signals = detectDesignSystem(tempDir, ['.']);
      expect(signals.storybook).toBe(true);
    });

    it('detects Tailwind', () => {
      fs.writeFileSync(path.join(tempDir, 'tailwind.config.js'), 'module.exports = {}');
      const signals = detectDesignSystem(tempDir, ['.']);
      expect(signals.tailwind).toBe(true);
    });

    it('detects styled-components from package.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        dependencies: { 'styled-components': '^5.0.0' }
      }));
      const signals = detectDesignSystem(tempDir, ['.']);
      expect(signals.styledComponents).toBe(true);
    });

    it('detects Emotion from package.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        dependencies: { '@emotion/react': '^11.0.0' }
      }));
      const signals = detectDesignSystem(tempDir, ['.']);
      expect(signals.emotion).toBe(true);
    });

    it('detects custom theme files', () => {
      fs.mkdirSync(path.join(tempDir, 'components'));
      fs.writeFileSync(path.join(tempDir, 'components', 'theme.ts'), 'export const theme = {}');
      const signals = detectDesignSystem(tempDir, ['components']);
      expect(signals.customTheme).toBe(true);
    });
  });

  describe('findComponentRoots', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'component-indexer-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('finds standard component directories', () => {
      fs.mkdirSync(path.join(tempDir, 'components'));
      fs.mkdirSync(path.join(tempDir, 'ui'));
      const roots = findComponentRoots(tempDir, ['.']);
      expect(roots).toContain('components');
      expect(roots).toContain('ui');
    });

    it('finds src/components structure', () => {
      fs.mkdirSync(path.join(tempDir, 'src', 'components'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'src', 'ui'), { recursive: true });
      const roots = findComponentRoots(tempDir, ['.']);
      expect(roots).toContain('src/components');
      expect(roots).toContain('src/ui');
    });

    it('finds components in frontend roots', () => {
      fs.mkdirSync(path.join(tempDir, 'packages', 'web', 'components'), { recursive: true });
      const roots = findComponentRoots(tempDir, ['packages/web']);
      expect(roots).toContain('packages/web/components');
    });
  });
});
