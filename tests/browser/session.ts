import '../../src/style.css';
import { MarkdownEditor } from '../../src/editor';
import { Preview } from '../../src/preview';
import { editorScrollPane, ScrollSync } from '../../src/scroll-sync';
import { ViewModes, type ViewMode } from '../../src/view-mode';
import { setupSplit } from '../../src/split';
import {
  captureSelection,
  restoreSelection,
  type UiState,
} from '../../src/session';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = async () => {
  for (let i = 0; i < 18; i++) await new Promise(requestAnimationFrame);
};
const modes: ViewMode[] = ['split', 'editor', 'viewer'];
const text = Array.from(
  { length: 100 },
  (_, i) =>
    `## 節 ${i + 1}\n\n日本語の長い本文です。${'折り返しと位置の確認。'.repeat(12)}\n`,
).join('\n');
type Saved = { ui: UiState; results: unknown[]; next: number };
const saved = JSON.parse(
  sessionStorage.getItem('resume-probe') ?? 'null',
) as Saved | null;
try {
  const template = new DOMParser().parseFromString(
    await (await fetch('/index.html')).text(),
    'text/html',
  );
  document.body.innerHTML = template.body.innerHTML;
  document.querySelectorAll('script').forEach((script) => script.remove());
  const split = setupSplit();
  const frame = document.querySelector<HTMLIFrameElement>('#preview')!;
  const editor = new MarkdownEditor(
    document.querySelector('#editor')!,
    text,
    false,
    () => {
      throw new Error('Restoration edited the document');
    },
  );
  const preview = new Preview(
    frame,
    async () => {
      throw new Error('No images expected');
    },
    async () => {},
    (message) => {
      throw new Error(message);
    },
  );
  await preview.ready;
  let ready = false;
  const sync = new ScrollSync(
    [
      editorScrollPane(editor.view, () => preview.sourceLines),
      preview.scrollPane(),
    ],
    () => ready && preview.renderedText === text,
  );
  const view = new ViewModes(
    document.querySelector('#split')!,
    document.querySelector('#view-menu')!,
    {
      beforeChange: (visible) => sync.setVisible(visible),
      changed: (mode) => {
        if (mode !== 'viewer') {
          editor.view.requestMeasure();
          editor.focus();
        } else frame.focus();
      },
    },
  );
  preview.layoutChanged = () => sync.refresh(true);
  editor.layoutChanged = () => sync.refresh();
  const resize = new ResizeObserver(() => sync.refresh(true));
  resize.observe(editor.view.scrollDOM);
  resize.observe(editor.view.contentDOM);
  ready = true;
  if (saved) {
    split.set(saved.ui.sourceWidth);
    restoreSelection(editor.view, saved.ui.selection);
    view.set(saved.ui.mode);
    sync.restore(saved.ui.scroll);
  }
  preview.update(text);
  if (view.mode === 'viewer') frame.focus();
  else editor.focus();
  for (let i = 0; i < 100 && preview.renderedText !== text; i++)
    await delay(25);
  if (preview.renderedText !== text) throw new Error('Preview did not render');
  await document.fonts.ready;
  await settle();
  const results = saved?.results ?? [];
  if (saved) {
    const current = sync.capture();
    const delta = Math.abs(current.line - saved.ui.scroll.line);
    if (
      delta > 0.2 ||
      current.atEnd !== saved.ui.scroll.atEnd ||
      view.mode !== saved.ui.mode ||
      split.get() !== saved.ui.sourceWidth ||
      JSON.stringify(captureSelection(editor.view)) !==
        JSON.stringify(saved.ui.selection)
    )
      throw new Error(
        `Restoration differs: ${JSON.stringify({ saved: saved.ui, current, delta })}`,
      );
    const pane =
      view.mode === 'viewer'
        ? preview.scrollPane()
        : editorScrollPane(editor.view, () => preview.sourceLines);
    const actualLine = pane.position().line;
    if (
      Math.abs(actualLine - saved.ui.scroll.line) > 0.2 &&
      !saved.ui.scroll.atEnd
    )
      throw new Error(
        `Actual viewport differs: ${actualLine} / ${saved.ui.scroll.line}`,
      );
    results.push({
      mode: view.mode,
      savedLine: saved.ui.scroll.line,
      actualLine,
      delta,
      atEnd: current.atEnd,
      sourceWidth: split.get(),
    });
  }
  const next = saved?.next ?? 0;
  if (next < modes.length + 1) {
    split.set(32);
    restoreSelection(editor.view, {
      anchor: { line: 18, column: 8 },
      head: { line: 17, column: 2 },
    });
    view.set(modes[next % modes.length]);
    sync.restore({ line: 120.4, atEnd: next === modes.length });
    await settle();
    const ui: UiState = {
      mode: view.mode,
      sourceWidth: split.get(),
      selection: captureSelection(editor.view),
      scroll: sync.capture(),
    };
    sessionStorage.setItem(
      'resume-probe',
      JSON.stringify({ ui, results, next: next + 1 }),
    );
    location.reload();
  } else {
    sessionStorage.removeItem('resume-probe');
    await fetch('/__scroll_probe_result', {
      method: 'POST',
      body: JSON.stringify({ status: 'PASS', restoration: results }),
    });
  }
} catch (error) {
  sessionStorage.removeItem('resume-probe');
  await fetch('/__scroll_probe_result', {
    method: 'POST',
    body: JSON.stringify({ status: 'FAIL', error: String(error) }),
  });
}
