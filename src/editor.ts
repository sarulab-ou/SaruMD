import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { indentWithTab } from '@codemirror/commands';
import { search, openSearchPanel } from '@codemirror/search';
import { imagePaste, type ImagePasteOptions } from './image-paste';

export class MarkdownEditor {
  readonly view: EditorView;
  private readonly access = new Compartment();
  constructor(
    parent: HTMLElement,
    text: string,
    readOnly: boolean,
    onEdit: (text: string) => void,
    private readonly paste?: ImagePasteOptions,
  ) {
    this.view = new EditorView({
      parent,
      state: this.state(text, readOnly, onEdit),
    });
  }
  private state(
    text: string,
    readOnly: boolean,
    onEdit: (text: string) => void,
  ): EditorState {
    return EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        markdown(),
        this.paste ? imagePaste(this.paste) : [],
        search({ top: true }),
        keymap.of([
          indentWithTab,
          {
            key: 'Mod-h',
            run: (view) => {
              if (view.composing) return false;
              openSearchPanel(view);
              view.dom
                .querySelector<HTMLInputElement>('input[name="replace"]')
                ?.focus();
              return true;
            },
          },
        ]),
        EditorState.phrases.of({
          Find: '検索',
          Replace: '置換',
          next: '次へ',
          previous: '前へ',
          all: 'すべて選択',
          'match case': '大文字小文字',
          regexp: '正規表現',
          'by word': '単語単位',
          replace: '置換',
          'replace all': 'すべて置換',
          close: '閉じる',
          'Go to line': '行へ移動',
          go: '移動',
          'Fold line': '行を折りたたむ',
          'Unfold line': '行を展開',
        }),
        EditorView.lineWrapping,
        this.access.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        EditorView.contentAttributes.of({
          'aria-label': 'Markdownソース編集',
          spellcheck: 'false',
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily:
              '"Cascadia Code", "BIZ UDGothic", "Yu Gothic UI", Consolas, monospace',
            lineHeight: '1.85',
          },
          '.cm-content': { padding: '20px 0' },
          '.cm-line': { padding: '0 22px' },
          '.cm-gutters': {
            background: '#f8f9fb',
            color: '#929baa',
            border: 'none',
          },
          '.cm-activeLine': { background: '#edf3ff88' },
          '.cm-focused': { outline: 'none' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onEdit(update.state.doc.toString());
        }),
      ],
    });
  }
  // Explicit reload is the only operation which intentionally resets Undo history.
  reload(
    text: string,
    readOnly: boolean,
    onEdit: (text: string) => void,
    preservePosition = false,
  ): void {
    const selection = this.view.state.selection.main;
    const scrollTop = this.view.scrollDOM.scrollTop;
    let next = this.state(text, readOnly, onEdit);
    if (preservePosition)
      next = next.update({
        selection: {
          anchor: Math.min(selection.anchor, next.doc.length),
          head: Math.min(selection.head, next.doc.length),
        },
      }).state;
    this.view.setState(next);
    if (preservePosition) this.view.scrollDOM.scrollTop = scrollTop;
  }
  search(): void {
    openSearchPanel(this.view);
  }
  setReadOnly(value: boolean): void {
    this.view.dispatch({
      effects: this.access.reconfigure([
        EditorState.readOnly.of(value),
        EditorView.editable.of(!value),
      ]),
    });
  }
  focus(): void {
    this.view.focus();
  }
}
