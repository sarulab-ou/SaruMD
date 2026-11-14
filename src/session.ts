import type { EditorView } from '@codemirror/view';
import type { ViewMode } from './view-mode';

export interface ReadingPosition {
  line: number;
  atEnd: boolean;
}

export interface UiState {
  mode: ViewMode;
  sourceWidth: number;
  selection: {
    anchor: { line: number; column: number };
    head: { line: number; column: number };
  };
  scroll: ReadingPosition;
}

export function captureSelection(view: EditorView): UiState['selection'] {
  const point = (offset: number) => {
    const line = view.state.doc.lineAt(offset);
    return { line: line.number, column: offset - line.from + 1 };
  };
  return {
    anchor: point(view.state.selection.main.anchor),
    head: point(view.state.selection.main.head),
  };
}

export function restoreSelection(
  view: EditorView,
  selection: UiState['selection'],
): void {
  const offset = (point: { line: number; column: number }) => {
    const line = view.state.doc.line(
      Math.max(1, Math.min(view.state.doc.lines, point.line)),
    );
    return line.from + Math.max(0, Math.min(line.length, point.column - 1));
  };
  // Restoring a cursor does not edit content, add Undo history, or scroll to the cursor.
  view.dispatch({
    selection: {
      anchor: offset(selection.anchor),
      head: offset(selection.head),
    },
  });
}
