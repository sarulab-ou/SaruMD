import '../../src/style.css';
import { MarkdownEditor } from '../../src/editor';
import { Preview } from '../../src/preview';
import { ScrollSync, editorScrollPane } from '../../src/scroll-sync';
import { ViewModes } from '../../src/view-mode';
import { captureSelection } from '../../src/session';
import { setupDocumentZoom, zoomShortcut } from '../../src/zoom';

const settle = async () => {
  for (let i = 0; i < 18; i++) await new Promise(requestAnimationFrame);
};
const sizes: unknown[] = [];
try {
  const template = new DOMParser().parseFromString(
    await (await fetch('/index.html')).text(),
    'text/html',
  );
  document.body.innerHTML = template.body.innerHTML;
  document.querySelectorAll('script').forEach((node) => node.remove());
  let text =
    '# 表示倍率\n\n`code`\n\n' +
    Array.from(
      { length: 100 },
      (_, i) => `## 節 ${i}\n\n${'折り返しと倍率を確認します。'.repeat(14)}\n`,
    ).join('\n');
  const frame = document.querySelector<HTMLIFrameElement>('#preview')!;
  const preview = new Preview(
    frame,
    async () => '',
    async () => {},
    (e) => {
      throw new Error(e);
    },
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
  editor.view.dispatch({
    changes: { from: text.length, insert: '\n未保存の追記' },
    selection: { anchor: 20, head: 10 },
  });
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
  const resize = new ResizeObserver(() => sync.refresh(true));
  resize.observe(editor.view.scrollDOM);
  resize.observe(editor.view.contentDOM);
  const zoom = setupDocumentZoom(
    document.querySelector('#split')!,
    editor.view,
    preview,
    sync,
  );
  const modes = new ViewModes(
    document.querySelector('#split')!,
    document.querySelector('#view-menu')!,
    {
      beforeChange: (visible) => sync.setVisible(visible),
      changed: () => editor.view.requestMeasure(),
    },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      const command = zoomShortcut(event);
      if (command) {
        event.preventDefault();
        event.stopPropagation();
        zoom.apply(command);
      }
    },
    { capture: true },
  );
  preview.update(text);
  for (let i = 0; i < 100 && preview.renderedText !== text; i++)
    await new Promise((r) => setTimeout(r, 25));
  if (preview.renderedText !== text) throw new Error('Preview not ready');
  await document.fonts.ready;
  await settle();
  const selection = JSON.stringify(captureSelection(editor.view));
  const original = text;
  const toolbar = getComputedStyle(
    document.querySelector('.toolbar')!,
  ).fontSize;
  const print = document.querySelector<HTMLElement>('#print-content')!;
  await preview.preparePrint(text, print);
  const printBefore = print.innerHTML;
  sync.restore({ line: 120.4, atEnd: false });
  await settle();
  const check = async (expected: number, name: string) => {
    await settle();
    const source = Number.parseFloat(
      getComputedStyle(editor.view.dom).fontSize,
    );
    const viewer = Number.parseFloat(
      frame.contentWindow!.getComputedStyle(frame.contentDocument!.body)
        .fontSize,
    );
    const heading = Number.parseFloat(
      frame.contentWindow!.getComputedStyle(
        frame.contentDocument!.querySelector('h1')!,
      ).fontSize,
    );
    const code = Number.parseFloat(
      frame.contentWindow!.getComputedStyle(
        frame.contentDocument!.querySelector('code')!,
      ).fontSize,
    );
    if (
      zoom.percent !== expected ||
      Math.abs(source - (14 * expected) / 100) > 0.01 ||
      Math.abs(viewer - (15 * expected) / 100) > 0.01 ||
      Math.abs(heading - (28 * expected) / 100) > 0.01 ||
      Math.abs(code - (13 * expected) / 100) > 0.01
    )
      throw new Error(
        `Scale mismatch ${JSON.stringify({ expected, source, viewer, heading, code })}`,
      );
    if (
      text !== original ||
      JSON.stringify(captureSelection(editor.view)) !== selection ||
      !editor.canUndo ||
      toolbar !== getComputedStyle(document.querySelector('.toolbar')!).fontSize
    )
      throw new Error('Zoom changed document, selection, Undo or toolbar');
    const pane =
      modes.mode === 'viewer'
        ? preview.scrollPane()
        : editorScrollPane(editor.view, () => preview.sourceLines);
    const line = pane.position().line;
    if (Math.abs(line - 120.4) > 0.2)
      throw new Error(`Zoom moved reading location: ${line}`);
    sizes.push({
      name,
      percent: expected,
      source,
      viewer,
      heading,
      code,
      line,
    });
  };
  const key = async (
    key: string,
    code: string,
    target: Document,
    expected: number,
  ) => {
    const event = new KeyboardEvent('keydown', {
      key,
      code,
      ctrlKey: true,
      shiftKey: key === '+',
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    if (!event.defaultPrevented)
      throw new Error('Native zoom was not prevented');
    await check(
      expected,
      `Ctrl+${key} from ${target === document ? 'editor' : 'preview'}`,
    );
  };
  await key(';', 'Semicolon', document, 110);
  await key('+', 'Equal', frame.contentDocument!, 120);
  await key('-', 'Minus', frame.contentDocument!, 110);
  modes.set('viewer');
  await settle();
  await key('Add', 'NumpadAdd', frame.contentDocument!, 120);
  modes.set('editor');
  await settle();
  await key('-', 'NumpadSubtract', document, 110);
  await key('0', 'Digit0', document, 100);
  modes.set('split');
  await settle();
  for (let i = 0; i < 50; i++) zoom.apply('in');
  await check(300, 'upper bound');
  if (!document.querySelector<HTMLButtonElement>('#zoom-in')!.disabled)
    throw new Error('Upper bound menu is enabled');
  for (let i = 0; i < 50; i++) zoom.apply('out');
  await check(50, 'lower bound');
  if (!document.querySelector<HTMLButtonElement>('#zoom-out')!.disabled)
    throw new Error('Lower bound menu is enabled');
  await preview.preparePrint(text, print);
  if (print.innerHTML !== printBefore)
    throw new Error('Zoom leaked into print content');
  await fetch('/__scroll_probe_result', {
    method: 'POST',
    body: JSON.stringify({ status: 'PASS', sizes, printUnchanged: true }),
  });
} catch (error) {
  await fetch('/__scroll_probe_result', {
    method: 'POST',
    body: JSON.stringify({ status: 'FAIL', error: String(error), sizes }),
  });
}
