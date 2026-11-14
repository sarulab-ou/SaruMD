import '../../src/style.css';
import { MarkdownEditor } from '../../src/editor';
import { EditorView } from '@codemirror/view';
import { Preview } from '../../src/preview';
import { ScrollSync, editorScrollPane } from '../../src/scroll-sync';
import { mathStyles } from '../../src/math-preview';
import { ViewModes, type ViewMode } from '../../src/view-mode';
import { setupMenus } from '../../src/menu';

const mathStyle = document.createElement('style');
mathStyle.textContent = mathStyles;
document.head.append(mathStyle);

const results: {
  name: string;
  delta: number;
  sourceTop: number;
  previewTop: number;
}[] = [];
const clicks: { name: string; expected: number; actual: number }[] = [];
const layouts: {
  mode: ViewMode;
  sourceWidth: number;
  viewerWidth: number;
  sourceLine: number;
  viewerLine: number;
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
    '# スクロール連動の検証\n\n' +
    String.raw`文中の数式 $E=mc^2$ と $\frac{a}{b}$ です。

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

$$
\begin{pmatrix}a&b\\c&d\end{pmatrix}
$$

` +
    '![遅延画像](image.png)\n\n' +
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
  const template = new DOMParser().parseFromString(
    await (await fetch('/index.html')).text(),
    'text/html',
  );
  document
    .querySelector('.toolbar')!
    .replaceChildren(
      document.importNode(
        template.querySelector('#view-menu-button')!.parentElement!,
        true,
      ),
    );
  const modes = new ViewModes(
    document.querySelector('#split')!,
    document.querySelector('#view-menu')!,
    {
      beforeChange: (visible) => sync.setVisible(visible),
      changed: (mode, previous) => {
        if (mode !== 'viewer') editor.view.requestMeasure();
        if (mode === 'viewer' || (mode === 'split' && previous === 'viewer'))
          frame.focus();
        else editor.focus();
      },
    },
  );
  setupMenus(
    [
      {
        trigger: document.querySelector('#view-menu-button')!,
        menu: document.querySelector('#view-menu')!,
        key: 'v',
      },
    ],
    () => editor.view.composing,
  );
  for (const mode of ['split', 'editor', 'viewer'] as const)
    document
      .querySelector(`#view-${mode}`)!
      .addEventListener('click', () => modes.set(mode));
  preview.layoutChanged = () => sync.refresh(true);
  preview.navigateToSource = (offset) => {
    if (modes.mode !== 'viewer' && preview.renderedText === text)
      editor.revealSource(offset);
  };
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
  const clickText = async (
    name: string,
    element: Element,
    character: number,
    expectedStart: number,
  ) => {
    const doc = frame.contentDocument!;
    doc.getSelection()?.removeAllRanges();
    doc.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    frame.contentWindow!.scrollTo(
      0,
      element.getBoundingClientRect().top + frame.contentWindow!.scrollY - 80,
    );
    await frames();
    const node = element.firstChild!;
    const range = doc.createRange();
    range.setStart(node, character);
    range.setEnd(node, character + 1);
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width * 0.25;
    const y = rect.top + rect.height * 0.5;
    const hit = doc.caretPositionFromPoint?.(x, y);
    const fallback = hit ? null : doc.caretRangeFromPoint(x, y);
    if ((hit?.offsetNode ?? fallback?.startContainer) !== node)
      throw new Error(`${name}: did not hit the intended text node`);
    const expected = expectedStart + (hit?.offset ?? fallback!.startOffset);
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    );
    const actual = editor.view.state.selection.main.head;
    clicks.push({ name, expected, actual });
    if (
      actual !== expected ||
      editor.view.state.doc.toString() !== text ||
      !editor.view.hasFocus
    )
      throw new Error(`${name}: source cursor ${actual}, expected ${expected}`);
    await frames();
  };
  const section = text.indexOf('## セクション 16\n');
  await clickText('heading click', heading(16), 3, section + 3);
  const code = frame.contentDocument!.querySelectorAll('pre code')[15];
  await clickText(
    'code click',
    code,
    code.textContent!.indexOf('console') + 3,
    text.indexOf('const n = 16;', section),
  );
  const cell = frame
    .contentDocument!.querySelectorAll('table')[15]
    .querySelectorAll('td')[1];
  await clickText(
    'table cell click',
    cell,
    1,
    text.indexOf('|値A|値B|', section) + '|値A|'.length,
  );
  const doc = frame.contentDocument!;
  const math = [...doc.querySelectorAll('math')];
  if (math.length !== 4)
    throw new Error(`Expected 4 formulas, got ${math.length}`);
  const fraction = doc.querySelector('mfrac')!;
  const numerator = fraction.children[0].getBoundingClientRect();
  const denominator = fraction.children[1].getBoundingClientRect();
  if (numerator.bottom > denominator.top + 1)
    throw new Error('Native fraction layout is not stacked');
  const rows = doc.querySelectorAll('mtr');
  if (
    rows.length !== 2 ||
    rows[1].getBoundingClientRect().top <=
      rows[0].getBoundingClientRect().top + 5
  )
    throw new Error('Native matrix layout is not stacked');
  doc.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
  frame.contentWindow!.scrollTo(0, 0);
  await frames();
  const formula = math[1].querySelector('mi')!;
  const rect = formula.getBoundingClientRect();
  formula.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  );
  const expectedMath = text.indexOf(String.raw`$\frac{a}{b}$`);
  const actualMath = editor.view.state.selection.main.head;
  clicks.push({
    name: 'math click',
    expected: expectedMath,
    actual: actualMath,
  });
  if (actualMath !== expectedMath)
    throw new Error(
      `Math source offset ${actualMath}, expected ${expectedMath}`,
    );
  const originalText = text;
  editor.view.dispatch({
    changes: { from: text.length, insert: '\n未保存の追記です。\n' },
  });
  await wait(() => preview.renderedText === text);
  const draft = text;
  const selection = editor.view.state.selection;
  const editorNode = editor.view.dom;
  const articleNode = doc.querySelector('article');
  doc.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
  frame.contentWindow!.scrollTo(
    0,
    heading(20).getBoundingClientRect().top + frame.contentWindow!.scrollY,
  );
  await frames();
  check('before view changes', 20);
  for (const mode of [
    'viewer',
    'editor',
    'split',
    'viewer',
    'split',
  ] as const) {
    const input = modes.mode === 'viewer' ? doc : document;
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'v',
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    if (document.querySelector<HTMLElement>('#view-menu')!.hidden)
      throw new Error('Alt+V did not open View');
    document.querySelector<HTMLButtonElement>(`#view-${mode}`)!.click();
    await frames();
    const root = document.querySelector<HTMLElement>('#split')!;
    const sourceWidth = root
      .querySelector('.source-pane')!
      .getBoundingClientRect().width;
    const viewerWidth = root
      .querySelector('.preview-pane')!
      .getBoundingClientRect().width;
    const fullWidth = root.getBoundingClientRect().width;
    layouts.push({
      mode,
      sourceWidth,
      viewerWidth,
      sourceLine: editorScrollPane(
        editor.view,
        () => preview.sourceLines,
      ).position().line,
      viewerLine: preview.scrollPane().position().line,
    });
    if (
      (mode === 'viewer' ? sourceWidth !== 0 : sourceWidth <= 0) ||
      (mode === 'editor' ? viewerWidth !== 0 : viewerWidth <= 0)
    )
      throw new Error(`Wrong visible panes for ${mode}`);
    if (
      mode !== 'split' &&
      Math.abs(Math.max(sourceWidth, viewerWidth) - fullWidth) > 1
    )
      throw new Error(`Single pane is not full width: ${mode}`);
    if (
      editor.view.dom !== editorNode ||
      doc.querySelector('article') !== articleNode ||
      editor.view.state.doc.toString() !== draft ||
      !editor.view.state.selection.eq(selection) ||
      !editor.canUndo
    )
      throw new Error(
        'Mode switch changed the draft, selection, or Undo state',
      );
    if (mode === 'viewer') {
      const node = heading(20),
        bounds = node.getBoundingClientRect();
      node.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          button: 0,
          clientX: bounds.left + 10,
          clientY: bounds.top + 5,
        }),
      );
      if (!editor.view.state.selection.eq(selection) || editor.view.hasFocus)
        throw new Error('Viewer-only click moved the hidden editor');
    }
    if (mode === 'split') check('split restored after single pane', 20);
  }
  editor.undo();
  await wait(() => preview.renderedText === originalText);
  if (text !== originalText)
    throw new Error('Undo did not restore the pre-switch document');
  modes.set('editor'); // Printing must still use the preview while its pane is hidden.
  await frames();
  const print = document.createElement('article');
  print.id = 'print-content';
  document.body.append(print);
  await preview.preparePrint(text, print);
  const printMath = [
    ...print.querySelectorAll('.winmd-math-inline,.winmd-math-block'),
  ];
  if (
    print.querySelectorAll('math').length !== 4 ||
    print.querySelector('[data-winmd-math],[data-winmd-line]')
  )
    throw new Error('Math print snapshot lost formulas or leaked metadata');
  modes.set('split');
  const css = [...document.querySelectorAll('style')]
    .map((style) => style.textContent)
    .join('\n');
  const printHtml = `<!doctype html><html lang="ja"><meta charset="utf-8"><style>${css}</style><body><article id="print-content"><h1>数式表示の検証</h1><p>インライン数式 ${printMath[0].outerHTML} と分数 ${printMath[1].outerHTML}。</p><h2>総和と分数</h2>${printMath[2].outerHTML}<h2>行列</h2>${printMath[3].outerHTML}<p>MATH_PRINT_END</p></article></body></html>`;
  if (errors.length) throw new Error(errors.join('; '));
  document.querySelector('#result')!.textContent = JSON.stringify({
    status: 'PASS',
    results,
    clicks,
    layouts,
    math: {
      count: math.length,
      fractionGap: denominator.top - numerator.bottom,
      matrixRows: rows.length,
      printCount: printMath.length,
    },
    printHtml,
  });
  sync.destroy();
  resize.disconnect();
  editor.view.destroy();
} catch (error) {
  document.querySelector('#result')!.textContent = JSON.stringify({
    status: 'FAIL',
    error: String(error),
    results,
    clicks,
    layouts,
  });
}
await fetch('/__scroll_probe_result', {
  method: 'POST',
  body: document.querySelector('#result')!.textContent,
});
