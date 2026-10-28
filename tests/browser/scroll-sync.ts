import '../../src/style.css';
import { MarkdownEditor } from '../../src/editor';
import { EditorView } from '@codemirror/view';
import { Preview } from '../../src/preview';
import { ScrollSync, editorScrollPane } from '../../src/scroll-sync';

const results: {
  name: string;
  delta: number;
  sourceTop: number;
  previewTop: number;
}[] = [];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wait = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error('Timed out waiting for preview/image');
};
const frames = async () => {
  await delay(250);
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
};
try {
  let text =
    '# スクロール連動の検証\n\n![遅延画像](image.png)\n\n' +
    Array.from(
      { length: 40 },
      (_, i) =>
        `## セクション ${i + 1}\n\n${'折り返しの長い本文です。'.repeat(((i % 4) + 1) * 9)}\n\n- 項目A\n- 項目B\n\n|列A|列B|\n|---|---|\n|値A|値B|\n\n\`\`\`js\nconst n = ${i + 1};\nconsole.log(n);\n\`\`\`\n\n`,
    ).join('');
  let resolveImage!: (value: string) => void;
  const pendingImage = new Promise<string>((r) => {
    resolveImage = r;
  });
  const frame = document.querySelector<HTMLIFrameElement>('#preview')!;
  const errors: string[] = [];
  const preview = new Preview(
    frame,
    () => pendingImage,
    async () => {},
    (e) => errors.push(e),
  );
  const editor = new MarkdownEditor(
    document.querySelector('#editor')!,
    text,
    false,
    (value) => {
      text = value;
      preview.update(value);
    },
  );
  await preview.ready;
  const sync = new ScrollSync(
    [
      editorScrollPane(editor.view, () => preview.sourceLines),
      preview.scrollPane(),
    ],
    () => preview.renderedText === text,
  );
  preview.layoutChanged = () => sync.refresh(true);
  editor.layoutChanged = () => sync.refresh();
  const resize = new ResizeObserver((entries) =>
    sync.refresh(
      entries.some((entry) => entry.target === editor.view.scrollDOM),
    ),
  );
  resize.observe(editor.view.scrollDOM);
  resize.observe(editor.view.contentDOM);
  preview.update(text);
  await wait(() => preview.renderedText === text);
  await document.fonts.ready;
  await frames();
  const position = (section: number) =>
    editor.view.state.doc.lineAt(text.indexOf(`## セクション ${section}\n`))
      .from;
  const heading = (section: number) =>
    frame.contentDocument!.querySelectorAll('h2')[section - 1];
  const sourceY = (section: number) =>
    editor.view.documentTop +
    editor.view.lineBlockAt(position(section)).top -
    editor.view.scrollDOM.getBoundingClientRect().top;
  const check = (name: string, section: number) => {
    const a = sourceY(section),
      b = heading(section).getBoundingClientRect().top;
    const delta = Math.abs(a - b);
    results.push({
      name,
      delta,
      sourceTop: editor.view.scrollDOM.scrollTop,
      previewTop: frame.contentWindow!.scrollY,
    });
    if (delta > 3)
      throw new Error(
        `${name}: alignment differs by ${delta}px (source ${a}, preview ${b})`,
      );
  };
  const fromSource = async (section: number) => {
    editor.view.scrollDOM.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true }),
    );
    editor.view.dispatch({
      effects: EditorView.scrollIntoView(position(section), {
        y: 'start',
        yMargin: 0,
      }),
    });
    await frames();
  };
  await fromSource(12);
  check('source to preview', 12);
  frame.contentDocument!.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true }),
  );
  frame.contentWindow!.scrollTo(
    0,
    heading(8).getBoundingClientRect().top + frame.contentWindow!.scrollY,
  );
  await frames();
  check('preview to source', 8);
  document
    .querySelector<HTMLElement>('#split')!
    .style.setProperty('--source-width', '32%');
  await frames();
  check('wrapped lines after resizing', 8);
  await fromSource(16);
  const before = editor.view.scrollDOM.scrollTop;
  const canvas = document.createElement('canvas');
  canvas.width = 260;
  canvas.height = 900;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#5d87cd';
  context.fillRect(0, 0, 260, 900);
  resolveImage(canvas.toDataURL('image/png'));
  await wait(() => !!frame.contentDocument!.querySelector('img')?.complete);
  await frames();
  check('late image layout', 16);
  if (Math.abs(editor.view.scrollDOM.scrollTop - before) > 1)
    throw new Error('Image loading moved the source pane');
  await delay(500);
  check('no feedback drift', 16);
  if (errors.length) throw new Error(errors.join('; '));
  document.querySelector('#result')!.textContent = JSON.stringify({
    status: 'PASS',
    results,
  });
  sync.destroy();
  resize.disconnect();
  editor.view.destroy();
} catch (error) {
  document.querySelector('#result')!.textContent = JSON.stringify({
    status: 'FAIL',
    error: String(error),
    results,
  });
}
await fetch('/__scroll_probe_result', {
  method: 'POST',
  body: document.querySelector('#result')!.textContent,
});
