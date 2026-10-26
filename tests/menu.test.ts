import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFileMenu } from '../src/menu';

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
    setupFileMenu(button, menu, () => blocked);
  });
  beforeEach(() => {
    blocked = false;
    key('Escape');
    document.querySelector<HTMLButtonElement>('#save')!.disabled = false;
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
      .querySelector('#path')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    button.click();
    document.querySelector<HTMLButtonElement>('#search')!.focus();
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
});
