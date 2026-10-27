import { basicSetup } from 'codemirror';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import {
  indentWithTab,
  undo,
  undoDepth,
  isolateHistory,
} from '@codemirror/commands';
import {
  search,
  openSearchPanel,
  findNext,
  findPrevious,
} from '@codemirror/search';
import {
  imagePaste,
  insertPastedImage,
  type ImagePasteOptions,
} from './image-paste';
import { formatTimestamp, type ClipboardContents } from './editing';

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
            key: 'F5',
            run: () => {
              this.insertTimestamp();
              return true;
            },
          },
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
    this.view.focus();
    openSearchPanel(this.view);
  }
  replace(): void {
    this.search();
    this.view.dom
      .querySelector<HTMLInputElement>('input[name="replace"]')
      ?.focus();
  }
  findNext(backwards = false): void {
    this.view.focus();
    (backwards ? findPrevious : findNext)(this.view);
  }
  get canEdit(): boolean {
    return !this.view.state.readOnly && !this.view.composing;
  }
  get hasSelection(): boolean {
    return this.view.state.selection.ranges.some((range) => !range.empty);
  }
  get canUndo(): boolean {
    return this.canEdit && undoDepth(this.view.state) > 0;
  }
  undo(): void {
    if (this.canUndo) undo(this.view);
    this.focus();
  }
  deleteSelection(): void {
    if (this.canEdit && this.hasSelection)
      this.insertText('', 'delete.selection');
    this.focus();
  }
  insertTimestamp(date = new Date()): void {
    if (this.canEdit) this.insertText(formatTimestamp(date));
    this.focus();
  }
  private insertText(text: string, userEvent = 'input'): void {
    this.view.dispatch({
      ...this.view.state.replaceSelection(text.replace(/\r\n?/g, '\n')),
      annotations: [
        Transaction.userEvent.of(userEvent),
        isolateHistory.of('full'),
      ],
      scrollIntoView: true,
    });
  }
  async cut(writeText: (text: string) => Promise<void>): Promise<void> {
    if (!this.canEdit || !this.hasSelection) return;
    const { doc, selection } = this.view.state;
    const text = selection.ranges
      .map((range) => doc.sliceString(range.from, range.to))
      .join('\n');
    await writeText(text); // A failed clipboard write must never remove the original text.
    if (
      !this.canEdit ||
      this.view.state.doc !== doc ||
      !this.view.state.selection.eq(selection)
    )
      throw new Error(
        '切り取り中に編集位置が変わったため、本文は削除していません。',
      );
    this.insertText('', 'delete.cut');
    this.focus();
  }
  async pasteClipboard(read: () => Promise<ClipboardContents>): Promise<void> {
    if (!this.canEdit) return;
    const { doc, selection } = this.view.state;
    const contents = await read();
    if (
      !this.canEdit ||
      this.view.state.doc !== doc ||
      !this.view.state.selection.eq(selection)
    )
      throw new Error(
        '貼り付け中に編集位置が変わったため、挿入を中止しました。',
      );
    if (contents.type === 'image') {
      if (!this.paste) throw new Error('画像の貼り付けを利用できません。');
      await insertPastedImage(
        this.view,
        () => Promise.resolve(contents.png),
        this.paste,
      );
    } else this.insertText(contents.text, 'input.paste');
    this.focus();
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
