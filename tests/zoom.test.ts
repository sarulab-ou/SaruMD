import { expect, it, vi } from 'vitest';
import { DocumentZoom, zoomShortcut } from '../src/zoom';

it.each([
  [';', 'Semicolon', 'in'],
  ['+', 'Equal', 'in'],
  ['=', 'Equal', 'in'],
  ['+', 'NumpadAdd', 'in'],
  ['Add', 'NumpadAdd', 'in'],
  ['-', 'Minus', 'out'],
  ['Subtract', 'NumpadSubtract', 'out'],
  ['0', 'Digit0', 'reset'],
] as const)('recognizes Ctrl+%s on %s', (key, code, expected) => {
  expect(
    zoomShortcut(
      new KeyboardEvent('keydown', {
        key,
        code,
        ctrlKey: true,
        shiftKey: key === '+',
      }),
    ),
  ).toBe(expected);
});

it('leaves text entry, IME, AltGr, other modifiers and unrelated shortcuts untouched', () => {
  for (const options of [
    {},
    { ctrlKey: true, altKey: true },
    { ctrlKey: true, metaKey: true },
    { ctrlKey: true, isComposing: true },
    { ctrlKey: true, keyCode: 229 },
  ])
    expect(
      zoomShortcut(new KeyboardEvent('keydown', { key: ';', ...options })),
    ).toBeNull();
  expect(
    zoomShortcut(new KeyboardEvent('keydown', { key: 's', ctrlKey: true })),
  ).toBeNull();
});

it('changes both pane scales once per step, bounds repeated shortcuts, and resets', () => {
  const changed = vi.fn();
  const zoom = new DocumentZoom(changed);
  zoom.apply('in');
  expect(zoom.percent).toBe(110);
  expect(changed).toHaveBeenLastCalledWith(110);
  for (let i = 0; i < 50; i++) zoom.apply('in');
  expect(zoom.percent).toBe(300);
  expect(changed).toHaveBeenCalledTimes(20);
  for (let i = 0; i < 50; i++) zoom.apply('out');
  expect(zoom.percent).toBe(50);
  zoom.apply('reset');
  expect(zoom.percent).toBe(100);
  const anotherWindow = new DocumentZoom(vi.fn());
  zoom.set(180);
  expect(anotherWindow.percent).toBe(100);
  zoom.set(Number.NaN);
  expect(zoom.percent).toBe(100);
});
