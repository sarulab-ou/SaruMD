import { afterEach, expect, it, vi } from 'vitest';
import {
  collectPreviewBlocks,
  previewScrollPane,
  ScrollSync,
  type ScrollPane,
} from '../src/scroll-sync';
import { mappedMarkdownHtml } from '../src/markdown';
import { sanitizePreview } from '../src/preview';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('maps real source lines after references, blank lines, lists, tables, and code fences', () => {
  const text =
    '[x]: https://example.com\n\n# 見出し\n\n本文 [リンク][x]\n続き\n\n- 一つ目\n- 二つ目\n\n|列|\n|-|\n|値|\n\n```js\nconst x=1;\n```\n\n末尾';
  const fragment = sanitizePreview(mappedMarkdownHtml(text));
  expect(fragment.querySelector('a')?.getAttribute('href')).toBe(
    'https://example.com',
  );
  const blocks = collectPreviewBlocks(fragment, text.split('\n').length);
  expect(blocks.map((b) => [b.line, b.element.tagName])).toEqual([
    [3, 'H1'],
    [5, 'P'],
    [8, 'UL'],
    [9, 'LI'],
    [11, 'TABLE'],
    [13, 'TR'],
    [15, 'PRE'],
    [19, 'P'],
  ]);
  expect(fragment.querySelector('[data-winmd-line]')).toBeNull();
});

it('does not trust raw HTML to supply locations or image sources', () => {
  const html = mappedMarkdownHtml(
    '<p data-winmd-line="9" onclick="bad()">偽</p>\n\n![画像](https://tracking.invalid/x)',
  );
  const fragment = sanitizePreview(html);
  const blocks = collectPreviewBlocks(fragment, 3);
  expect(blocks.map((b) => b.line)).toEqual([3]);
  expect(fragment.querySelector('[onclick],[src]')).toBeNull();
  expect(fragment.textContent).toContain('<p data-winmd-line="9"');
  const invalid = sanitizePreview(
    '<p data-winmd-line="Infinity">x</p><p data-winmd-line="0">y</p><p data-winmd-line="100">z</p>',
  );
  expect(collectPreviewBlocks(invalid, 3)).toEqual([]);
  expect(invalid.querySelector('[data-winmd-line]')).toBeNull();
});

it('interpolates by neighboring blocks instead of overall scroll percentage, including image growth', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = '<article><h1>A</h1><p>B</p><h2>C</h2></article>';
  let top = 0;
  let imageGrowth = 0;
  Object.defineProperty(frame.contentWindow!, 'scrollY', { get: () => top });
  Object.defineProperty(doc.documentElement, 'scrollHeight', {
    get: () => 2000 + imageGrowth,
  });
  Object.defineProperty(doc.documentElement, 'clientHeight', { value: 500 });
  const elements = [...doc.querySelectorAll('h1,p,h2')];
  for (const [i, element] of elements.entries())
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
      () => ({ top: [28, 200, 900 + imageGrowth][i] - top }) as DOMRect,
    );
  vi.spyOn(
    doc.querySelector('article')!,
    'getBoundingClientRect',
  ).mockImplementation(() => ({ bottom: 1200 + imageGrowth - top }) as DOMRect);
  const pane = previewScrollPane(
    frame,
    () => elements.map((element, i) => ({ line: [1, 5, 9][i], element })),
    () => 12,
  );
  expect(pane.topForLine(5)).toBe(200);
  expect(pane.topForLine(7)).toBe(550);
  top = 550;
  expect(pane.position().line).toBe(7);
  imageGrowth = 600;
  expect(pane.topForLine(7)).toBe(850);
  top = 850;
  expect(pane.position().line).toBe(7);
});

function setup() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.push(fn);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const pane = (scale: number) => {
    let units = scale;
    const events = new EventTarget();
    const outerInput = new EventTarget();
    let top = 0;
    const setTop = vi.fn((value: number) => {
      top = value;
      events.dispatchEvent(new Event('scroll'));
    });
    const result: ScrollPane = {
      events,
      outerInput,
      input: events,
      position: () => ({ top, max: units * 100, line: top / units + 1 }),
      topForLine: (line) => (line - 1) * units,
      setTop,
    };
    return {
      ...result,
      setTop,
      resize(value: number) {
        units = value;
      },
      userScroll(value: number) {
        events.dispatchEvent(new Event('wheel'));
        top = value;
        events.dispatchEvent(new Event('scroll'));
      },
    };
  };
  const left = pane(10);
  const right = pane(30);
  let enabled = true;
  const sync = new ScrollSync([left, right], () => enabled);
  const flush = () => {
    const pending = frames.splice(0);
    for (const frame of pending) frame(0);
  };
  return {
    left,
    right,
    sync,
    flush,
    frames,
    enable(value: boolean) {
      enabled = value;
    },
  };
}

it('synchronizes both directions once per frame without mirrored-event feedback', () => {
  const { left, right, flush, frames, sync } = setup();
  left.userScroll(100);
  left.userScroll(200);
  expect(frames).toHaveLength(1);
  flush();
  expect(right.position().top).toBe(600);
  expect(right.setTop).toHaveBeenCalledTimes(1);
  expect(left.setTop).not.toHaveBeenCalled();
  expect(frames).toHaveLength(0);
  right.userScroll(900);
  flush();
  expect(left.position().top).toBe(300);
  expect(frames).toHaveLength(0);
  sync.destroy();
  left.userScroll(500);
  sync.refresh();
  expect(frames).toHaveLength(0);
});

it('does not transfer control when the follower adjusts its layout after scrolling', () => {
  const { left, right, sync, flush, frames } = setup();
  right.userScroll(900);
  flush();
  left.setTop(330); // CodeMirror height remeasurement, without user input.
  sync.refresh();
  flush();
  expect(left.position().top).toBe(300);
  expect(right.position().top).toBe(900);
  expect(frames).toHaveLength(0);
});

it('retains the active source location when both pane heights change', () => {
  const { left, right, sync, flush } = setup();
  right.userScroll(900);
  flush();
  left.resize(20);
  right.resize(50);
  sync.refresh(true);
  flush();
  expect(left.position().top).toBe(600);
  expect(right.position().top).toBe(1500);
});

it('accepts scrollbar input on the iframe element as well as inside its document', () => {
  const { left, right, flush } = setup();
  left.userScroll(100);
  flush();
  right.outerInput!.dispatchEvent(new Event('pointerdown'));
  right.setTop(900);
  flush();
  expect(left.position().top).toBe(300);
});

it('aligns the start/end, ignores stale previews, and follows the latest pane on relayout', () => {
  const { left, right, flush, sync, enable } = setup();
  left.userScroll(1000);
  flush();
  expect(right.position().top).toBe(3000);
  left.userScroll(0);
  flush();
  expect(right.position().top).toBe(0);
  enable(false);
  left.userScroll(250);
  flush();
  expect(right.position().top).toBe(0);
  enable(true);
  sync.refresh();
  flush();
  expect(right.position().top).toBe(750);
  right.userScroll(1200);
  flush();
  right.topForLine = (line) => (line - 1) * 50;
  left.topForLine = (line) => (line - 1) * 20;
  sync.refresh();
  flush();
  expect(left.position().top).toBe(800);
  expect(right.position().top).toBe(1200);
});
