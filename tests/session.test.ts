import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';
import { captureSelection, restoreSelection } from '../src/session';

function view(text: string, anchor = 0, head = anchor): EditorView {
  const result = {
    state: EditorState.create({ doc: text, selection: { anchor, head } }),
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      this.state = this.state.update(spec).state;
    },
  };
  return result as unknown as EditorView;
}

it('restores a backward selection by line/column without editing the document', () => {
  const source = view('一行目\n日本語😀の行\nlast', 12, 5);
  const selection = captureSelection(source);
  const reopened = view(source.state.doc.toString());
  restoreSelection(reopened, selection);
  expect(reopened.state.selection.main.anchor).toBe(12);
  expect(reopened.state.selection.main.head).toBe(5);
  expect(reopened.state.doc.toString()).toBe(source.state.doc.toString());
});

it('clamps the restored cursor when discarded edits or external changes shortened the file', () => {
  const source = view('first\na longer second line\nthird', 30, 12);
  const selection = captureSelection(source);
  const reopened = view('first\n短い');
  restoreSelection(reopened, selection);
  expect(reopened.state.selection.main.anchor).toBe(8);
  expect(reopened.state.selection.main.head).toBe(8);
  expect(reopened.state.doc.toString()).toBe('first\n短い');
});
