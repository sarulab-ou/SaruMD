import '../../src/style.css';
import { MarkdownEditor } from '../../src/editor';
import { Preview } from '../../src/preview';

const source =
  '# リンク確認\n\nhttps://example.com/source\n\n[リンク](https://example.org/preview)\n\n`https://example.net/code`\n\n[危険](javascript:alert(1))\n';
const opens: { pane: string; url: string }[] = [];
const errors: string[] = [];
const frame = document.querySelector<HTMLIFrameElement>('#preview')!;
const open = (pane: string) => async (url: string) => {
  opens.push({ pane, url });
};
const preview = new Preview(
  frame,
  async () => {
    throw new Error('Unexpected image');
  },
  open('preview'),
  (error) => errors.push(error),
);
const editor = new MarkdownEditor(
  document.querySelector('#editor')!,
  source,
  false,
  () => {
    throw new Error('Click changed Markdown');
  },
  undefined,
  { open: open('source'), report: (error) => errors.push(error) },
);
await preview.ready;
preview.update(source);
for (let attempt = 0; preview.renderedText !== source; attempt++) {
  if (attempt > 100) throw new Error('Preview timed out');
  await new Promise((resolve) => setTimeout(resolve, 30));
}
const probe = {
  point(pane: string, part: string) {
    const element =
      pane === 'source'
        ? document.querySelector<HTMLElement>(
            `.cm-http-link[data-http-url*="${part}"]`,
          )!
        : frame.contentDocument!.querySelector<HTMLElement>(
            `a[href*="${part}"]`,
          )!;
    if (!element) throw new Error(`Missing ${pane} link ${part}`);
    const rect = element.getBoundingClientRect(),
      offset =
        pane === 'source' ? { left: 0, top: 0 } : frame.getBoundingClientRect();
    return {
      x: offset.left + rect.left + Math.min(12, rect.width / 2),
      y: offset.top + rect.top + rect.height / 2,
    };
  },
  clear() {
    editor.view.dispatch({ selection: { anchor: 0 } });
    frame.contentDocument!.getSelection()?.removeAllRanges();
  },
  synthetic() {
    document.querySelector<HTMLElement>('.cm-http-link')!.click();
    frame.contentDocument!.querySelector<HTMLElement>('a')!.click();
  },
  readonly() {
    editor.setReadOnly(true);
  },
  result() {
    return {
      opens,
      errors,
      unchanged: editor.view.state.doc.toString() === source,
      canUndo: editor.canUndo,
      previewHref: frame
        .contentDocument!.querySelector('a')
        ?.getAttribute('href'),
    };
  },
};
Object.assign(window, { linksProbe: probe });
