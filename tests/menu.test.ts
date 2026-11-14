import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMenus } from '../src/menu';

describe('file menu', () => {
  let button: HTMLButtonElement;
  let menu: HTMLElement;
  let blocked = false;
  const key = (value: string, options: KeyboardEventInit = {}) =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  beforeAll(() => {
    document.body.innerHTML = readFileSync('index.html', 'utf8').match(
      /<body>([\s\S]*)<\/body>/,
    )![1];
    button = document.querySelector('#file-menu-button')!;
    menu = document.querySelector('#file-menu')!;
    blocked = false;
    setupMenus(
      [
        { trigger: button, menu, key: 'f' },
        {
          trigger: document.querySelector('#edit-menu-button')!,
          menu: document.querySelector('#edit-menu')!,
          key: 'e',
        },
        {
          trigger: document.querySelector('#view-menu-button')!,
          menu: document.querySelector('#view-menu')!,
          key: 'v',
        },
        {
          trigger: document.querySelector('#tools-menu-button')!,
          menu: document.querySelector('#tools-menu')!,
          key: 't',
        },
        {
          trigger: document.querySelector('#help-menu-button')!,
          menu: document.querySelector('#help-menu')!,
          key: 'h',
        },
      ],
      () => blocked,
    );
  });
  beforeEach(() => {
    blocked = false;
    key('Escape');
    document.querySelector<HTMLButtonElement>('#save')!.disabled = false;
    document.querySelector<HTMLButtonElement>('#open-folder')!.disabled = false;
  });
  it('shows shortcuts and supports Alt+F, arrows, Home/End and Escape', () => {
    expect(document.querySelector('.brand')).toBeNull();
    expect(document.querySelector('#print')?.textContent).toContain('Ctrl+P');
    expect(document.querySelector('#new')?.textContent).toContain('Ctrl+N');
    key('f', { altKey: true });
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('new');
    key('ArrowDown');
    expect(document.activeElement?.id).toBe('open');
    key('End');
    expect(document.activeElement?.id).toBe('exit');
    key('ArrowDown');
    expect(document.activeElement?.id).toBe('new');
    key('Escape');
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
  it('skips disabled items and closes on command, outside click and focus change', () => {
    document.querySelector<HTMLButtonElement>('#save')!.disabled = true;
    button.click();
    key('ArrowDown');
    key('ArrowDown');
    expect(document.activeElement?.id).toBe('save-as');
    const action = vi.fn();
    menu.querySelector('#export-pdf')!.addEventListener('click', action);
    menu.querySelector<HTMLButtonElement>('#export-pdf')!.click();
    expect(action).toHaveBeenCalledOnce();
    expect(menu.hidden).toBe(true);
    button.click();
    document
      .querySelector('#editor')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    button.click();
    document.querySelector<HTMLElement>('#divider')!.focus();
    expect(menu.hidden).toBe(true);
  });
  it('does not intercept IME or open over an exclusive operation/dialog', () => {
    key('f', { altKey: true, isComposing: true });
    expect(menu.hidden).toBe(true);
    blocked = true;
    key('f', { altKey: true });
    button.click();
    expect(menu.hidden).toBe(true);
  });
  it('opens Edit with Alt+E and switches between menus with arrow keys', () => {
    key('e', { altKey: true });
    expect(document.querySelector<HTMLElement>('#edit-menu')!.hidden).toBe(
      false,
    );
    expect(menu.hidden).toBe(true);
    expect(document.activeElement?.id).toBe('undo');
    expect(document.querySelector('#timestamp')?.textContent).toContain('F5');
    key('ArrowLeft');
    expect(menu.hidden).toBe(false);
    key('ArrowRight');
    expect(document.activeElement?.id).toBe('undo');
    key('Escape');
    expect(document.activeElement?.id).toBe('edit-menu-button');
  });
  it('opens View with Alt+V and supports radio items, command closing, and Tools/Help navigation', () => {
    key('v', { altKey: true });
    const viewMenu = document.querySelector<HTMLElement>('#view-menu')!;
    expect(viewMenu.hidden).toBe(false);
    expect(document.activeElement?.id).toBe('view-split');
    key('ArrowDown');
    expect(document.activeElement?.id).toBe('view-editor');
    key('End');
    expect(document.activeElement?.id).toBe('view-viewer');
    document.querySelector<HTMLButtonElement>('#view-viewer')!.click();
    expect(viewMenu.hidden).toBe(true);
    key('v', { altKey: true });
    key('ArrowRight');
    expect(document.querySelector<HTMLElement>('#tools-menu')!.hidden).toBe(
      false,
    );
    key('ArrowRight');
    expect(document.querySelector<HTMLElement>('#help-menu')!.hidden).toBe(
      false,
    );
    key('ArrowLeft');
    expect(document.activeElement?.id).toBe('open-folder');
    key('ArrowLeft');
    expect(document.activeElement?.id).toBe('view-split');
  });
  it('opens Tools with Alt+T and skips the folder action for an unsaved document', () => {
    const folder = document.querySelector<HTMLButtonElement>('#open-folder')!;
    folder.disabled = true;
    key('t', { altKey: true });
    expect(document.querySelector<HTMLElement>('#tools-menu')!.hidden).toBe(
      false,
    );
    expect(document.activeElement?.id).toBe('tools-menu-button');
    key('Escape');
    folder.disabled = false;
    key('t', { altKey: true });
    expect(document.activeElement).toBe(folder);
    folder.click();
    expect(document.querySelector<HTMLElement>('#tools-menu')!.hidden).toBe(
      true,
    );
  });
});
