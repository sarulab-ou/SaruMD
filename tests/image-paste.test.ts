import { afterEach, expect, it, vi } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import {
  clipboardPng,
  imagePaste,
  type ImagePasteOptions,
  type PasteTarget,
} from '../src/image-paste';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup(
  persist: ImagePasteOptions['persist'],
  text = '',
  readOnly = false,
) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const report = vi.fn();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        imagePaste({ persist, report }),
        EditorState.readOnly.of(readOnly),
      ],
    }),
  });
  views.push(view);
  return { view, report };
}
function paste(view: EditorView, file: File | null, text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: file
        ? [{ kind: 'file', type: file.type, getAsFile: () => file }]
        : [],
      getData: () => text,
      files: file ? [file] : [],
    },
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}
function png() {
  const file = new File(['PNG'], 'clipboard.png', { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  });
  return file;
}

it('inserts the timestamp PNG link only after successful storage, with Undo/Redo', async () => {
  const { view } = setup(async (read, target) => {
    expect(await read()).toEqual(new Uint8Array([1, 2, 3]));
    target.insert('20261026_231824.png');
  });
  expect(paste(view, png()).defaultPrevented).toBe(true);
  await tick();
  expect(view.state.doc.toString()).toBe('![画像](20261026_231824.png)');
  undo(view);
  expect(view.state.doc.toString()).toBe('');
  redo(view);
  expect(view.state.doc.toString()).toBe('![画像](20261026_231824.png)');
});

it('maps the original insertion position through edits made during PNG storage', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { view } = setup(async (_read, target) => {
    await gate;
    target.insert('20261026_231824.png');
  }, 'AB');
  view.dispatch({ selection: EditorSelection.cursor(1) });
  paste(view, png());
  view.dispatch({ changes: { from: 0, insert: '前' } });
  release();
  await tick();
  expect(view.state.doc.toString()).toBe('前A![画像](20261026_231824.png)B');
});

it('does not replace text if image storage fails or the selected range was edited', async () => {
  const failed = setup(async () => {
    throw new Error('access denied');
  }, 'keep');
  failed.view.dispatch({ selection: { anchor: 0, head: 4 } });
  paste(failed.view, png());
  await tick();
  expect(failed.view.state.doc.toString()).toBe('keep');
  expect(failed.report).toHaveBeenCalled();
  let target!: PasteTarget;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const changed = setup(async (_read, pending) => {
    target = pending;
    await gate;
    pending.insert('20261026_231824.png');
  }, 'ABCD');
  changed.view.dispatch({ selection: { anchor: 1, head: 3 } });
  paste(changed.view, png());
  changed.view.dispatch({ changes: { from: 1, to: 3, insert: 'new text' } });
  expect(target.valid()).toBe(false);
  release();
  await tick();
  expect(changed.view.state.doc.toString()).toBe('Anew textD');
  expect(changed.report).toHaveBeenCalled();
});

it('leaves ordinary text paste and read-only documents alone, and rejects SVG', async () => {
  const persist = vi.fn().mockResolvedValue(undefined);
  const { view, report } = setup(persist);
  paste(view, null, 'ordinary text');
  await tick();
  expect(view.state.doc.toString()).toBe('ordinary text');
  const readonly = setup(persist, 'protected', true);
  paste(readonly.view, png());
  expect(readonly.view.state.doc.toString()).toBe('protected');
  paste(view, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
  await tick();
  expect(persist).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalled();
});

it('enforces clipboard limits before reading bytes', async () => {
  const file = png();
  Object.defineProperty(file, 'size', { value: 16 * 1024 * 1024 + 1 });
  await expect(clipboardPng(file)).rejects.toThrow('16 MiB');
});
