const { drawBox, ansi, createMenu } = require('../lib/tui.cjs');

describe('tui', () => {
  test('drawBox renders bordered content', () => {
    const out = drawBox('Title', 'Hello', 20);
    expect(out).toContain('Hello');
    expect(out).toContain('┌');
  });

  test('exports ansi constants', () => {
    expect(ansi).toHaveProperty('CLEAR_SCREEN');
  });

  test('createMenu returns controls', () => {
    const menu = createMenu({
      title: 'T',
      items: [{ label: 'One', action: 'one' }],
      onSelect: () => {},
      onExit: () => {},
    });
    expect(menu).toHaveProperty('start');
    expect(menu).toHaveProperty('render');
  });
});
