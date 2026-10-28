import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { redo } from '@codemirror/commands';
import { SearchQuery, setSearchQuery } from '@codemirror/search';
import { MarkdownEditor } from '../src/editor';
import { formatTimestamp } from '../src/editing';
import type { ImagePasteOptions } from '../src/image-paste';

const editors: MarkdownEditor[] = [];
function setup(text: string, readOnly = false, paste?: ImagePasteOptions) {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new MarkdownEditor(host, text, readOnly, vi.fn(), paste);
  editors.push(editor);
  return editor;
}
const select = (editor: MarkdownEditor, from: number, to = from) =>
  editor.view.dispatch({ selection: EditorSelection.single(from, to) });
afterEach(() => {
  for (const editor of editors) editor.view.destroy();
  editors.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('edit commands', () => {
  it('reveals a source position without changing the document or adding undo history', () => {
    const editor = setup('日本語\n次の行', true);
    editor.revealSource(5);
    expect(editor.view.state.selection.main.head).toBe(5);
    expect(editor.view.state.doc.toString()).toBe('日本語\n次の行');
    expect(editor.canUndo).toBe(false);
    editor.revealSource(Number.NaN);
    expect(editor.view.state.selection.main.head).toBe(5);
    editor.revealSource(999);
    expect(editor.view.state.selection.main.head).toBe(
      editor.view.state.doc.length,
    );
    expect(editor.view.hasFocus).toBe(true);
  });
  it('formats padded local date/time and inserts at the selection as one undo step', () => {
    const date = new Date(2026, 0, 3, 8, 32, 2);
    expect(formatTimestamp(date)).toBe('2026/01/03 08:32:02');
    const editor = setup('前選択後');
    select(editor, 1, 3);
    editor.insertTimestamp(date);
    expect(editor.view.state.doc.toString()).toBe('前2026/01/03 08:32:02後');
    editor.undo();
    expect(editor.view.state.doc.toString()).toBe('前選択後');
    redo(editor.view);
    expect(editor.view.state.doc.toString()).toBe('前2026/01/03 08:32:02後');
  });
  it('does not remove cut text on clipboard failure or intervening selection/edit changes', async () => {
    const editor = setup('日本語の本文');
    select(editor, 0, 3);
    await expect(
      editor.cut(async () => {
        throw new Error('clipboard busy');
      }),
    ).rejects.toThrow('clipboard busy');
    expect(editor.view.state.doc.toString()).toBe('日本語の本文');
    let finish!: () => void;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = editor.cut(write);
    expect(write).toHaveBeenCalledWith('日本語');
    select(editor, 4);
    finish();
    await expect(pending).rejects.toThrow('削除していません');
    expect(editor.view.state.doc.toString()).toBe('日本語の本文');
    select(editor, 0, 3);
    await editor.cut(async () => undefined);
    expect(editor.view.state.doc.toString()).toBe('の本文');
    editor.undo();
    expect(editor.view.state.doc.toString()).toBe('日本語の本文');
  });
  it('pastes plain text with normalized newlines; rejects stale asynchronous targets', async () => {
    const editor = setup('ab');
    select(editor, 1);
    await editor.pasteClipboard(async () => ({
      type: 'text',
      text: '日\r\n本\r語',
    }));
    expect(editor.view.state.doc.toString()).toBe('a日\n本\n語b');
    editor.undo();
    expect(editor.view.state.doc.toString()).toBe('ab');
    let finish!: (value: { type: 'text'; text: string }) => void;
    const pending = editor.pasteClipboard(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    editor.view.dispatch({ changes: { from: 0, insert: '追加' } });
    finish({ type: 'text', text: 'stale' });
    await expect(pending).rejects.toThrow('挿入を中止');
    expect(editor.view.state.doc.toString()).toBe('追加ab');
  });
  it('menu image paste shares the existing PNG persistence/undo path', async () => {
    const png = new Uint8Array([1, 2, 3]);
    const persist = vi.fn<ImagePasteOptions['persist']>(
      async (read, target) => {
        expect(await read()).toEqual(png);
        expect(target.valid()).toBe(true);
        target.insert('20261027_123456.png');
      },
    );
    const editor = setup('画像: ', false, { persist, report: vi.fn() });
    select(editor, 4);
    await editor.pasteClipboard(async () => ({ type: 'image', png }));
    expect(persist).toHaveBeenCalledOnce();
    expect(editor.view.state.doc.toString()).toBe(
      '画像: ![画像](20261027_123456.png)',
    );
    editor.undo();
    expect(editor.view.state.doc.toString()).toBe('画像: ');
  });
  it('finds next/previous with wraparound and opens the replacement input', () => {
    const editor = setup('日本語 abc 日本語');
    editor.view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: '日本語' })),
    });
    editor.findNext();
    expect(editor.view.state.selection.main.from).toBe(0);
    editor.findNext();
    expect(editor.view.state.selection.main.from).toBe(8);
    editor.findNext();
    expect(editor.view.state.selection.main.from).toBe(0);
    editor.findNext(true);
    expect(editor.view.state.selection.main.from).toBe(8);
    editor.replace();
    expect(document.activeElement?.getAttribute('name')).toBe('replace');
  });
  it('keeps readonly documents unchanged and only deletes selected text', async () => {
    const editor = setup('abc', true);
    select(editor, 0, 2);
    const read = vi.fn(),
      write = vi.fn();
    editor.insertTimestamp();
    editor.deleteSelection();
    editor.undo();
    await editor.cut(write);
    await editor.pasteClipboard(read);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(editor.view.state.doc.toString()).toBe('abc');
    editor.setReadOnly(false);
    editor.deleteSelection();
    expect(editor.view.state.doc.toString()).toBe('c');
    editor.deleteSelection();
    expect(editor.view.state.doc.toString()).toBe('c');
  });
});
