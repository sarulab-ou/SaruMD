import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { ViewModes } from '../src/view-mode';

beforeEach(() => {
  document.body.innerHTML = readFileSync('index.html', 'utf8').match(
    /<body>([\s\S]*)<\/body>/,
  )![1];
});

function setup() {
  const root = document.querySelector<HTMLElement>('#split')!;
  const menu = document.querySelector<HTMLElement>('#view-menu')!;
  const beforeChange = vi.fn();
  const changed = vi.fn();
  return {
    root,
    menu,
    beforeChange,
    changed,
    modes: new ViewModes(root, menu, { beforeChange, changed }),
  };
}

it('switches all three layouts without replacing either pane or changing the split ratio', () => {
  const { root, menu, modes } = setup();
  const source = root.querySelector<HTMLElement>('.source-pane')!;
  const viewer = root.querySelector<HTMLElement>('.preview-pane')!;
  const divider = root.querySelector<HTMLElement>('#divider')!;
  source.querySelector('#editor')!.textContent = 'unsaved draft';
  root.style.setProperty('--source-width', '64%');
  for (const mode of ['editor', 'viewer', 'split'] as const) {
    modes.set(mode);
    expect(source.hidden).toBe(mode === 'viewer');
    expect(viewer.hidden).toBe(mode === 'editor');
    expect(divider.hidden).toBe(mode !== 'split');
    expect(root.querySelector('.source-pane')).toBe(source);
    expect(root.querySelector('.preview-pane')).toBe(viewer);
    expect(root.style.getPropertyValue('--source-width')).toBe('64%');
    expect(source.querySelector('#editor')!.textContent).toBe('unsaved draft');
    expect(menu.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
    expect(
      menu.querySelector(`#view-${mode}`)?.getAttribute('aria-checked'),
    ).toBe('true');
  }
});

it('captures the old visible layout before hiding panes and reports the new mode afterward', () => {
  const { modes, root, beforeChange, changed } = setup();
  beforeChange.mockImplementation(() =>
    expect(root.dataset.viewMode).toBe('split'),
  );
  modes.set('viewer');
  expect(beforeChange).toHaveBeenCalledWith([false, true]);
  expect(changed).toHaveBeenCalledWith('viewer', 'split');
  expect(root.dataset.viewMode).toBe('viewer');
});

it('reveals the editor for an explicit edit command while keeping editor-only mode intact', () => {
  const { modes } = setup();
  modes.set('viewer');
  modes.showEditor();
  expect(modes.mode).toBe('split');
  modes.set('editor');
  modes.showEditor();
  expect(modes.mode).toBe('editor');
});
