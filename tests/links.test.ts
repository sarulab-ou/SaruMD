import { afterEach, expect, it, vi } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { MarkdownEditor } from '../src/editor';
import {
  httpLinks,
  isLinkClick,
  linkifyHttpText,
  safeLinkReference,
} from '../src/links';
import { sanitizePreview } from '../src/preview';
import { mappedMarkdownHtml } from '../src/markdown';

afterEach(() => {
  document.body.replaceChildren();
});

it('keeps local Markdown destinations inert through sanitization and rejects URL handlers', () => {
  const fragment = sanitizePreview(
    mappedMarkdownHtml(
      '[今回の記録](latest-continuation.md) / [JSON](summary.json) / [空白](<sub folder/日本語.md>) / [file](file:///C:/notes/a.md)',
    ),
  );
  expect(
    [...fragment.querySelectorAll('a')].map((a) =>
      a.getAttribute('data-winmd-link'),
    ),
  ).toEqual([
    'latest-continuation.md',
    'summary.json',
    'sub folder/日本語.md',
    'file:///C:/notes/a.md',
  ]);
  expect(fragment.querySelector('a[href]')).toBeNull();
  expect(
    sanitizePreview(
      '<a data-winmd-link="javascript:alert(1)">x</a>',
    ).querySelector('[data-winmd-link]'),
  ).toBeNull();
  for (const raw of [
    'javascript:alert(1)',
    'data:text/html,x',
    'ms-settings:display',
    '//server/x.md',
    'file://server/share/x.md',
    '#heading',
    '?query',
    'bad\0.md',
  ])
    expect(safeLinkReference(raw)).toBeNull();
  expect(safeLinkReference('C:\\notes\\a.md')).toBe('C:\\notes\\a.md');
});

it('makes source Markdown labels and destinations clickable without changing text or code', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const text =
    '[今回の記録](latest-continuation.md) / [JSON](summary.json)\n\n[空白](<sub folder/日本語.md>)\n\n`[コード](ignore.md)`\n\n![画像](image.png)';
  const editor = new MarkdownEditor(host, text, false, vi.fn(), undefined, {
    open: vi.fn(),
    report: vi.fn(),
  });
  try {
    expect(
      [...host.querySelectorAll<HTMLElement>('.cm-file-link')].map(
        (a) => a.dataset.linkReference,
      ),
    ).toEqual([
      'latest-continuation.md',
      'summary.json',
      'sub folder/日本語.md',
    ]);
    expect(editor.view.state.doc.toString()).toBe(text);
    expect(editor.canUndo).toBe(false);
  } finally {
    editor.view.destroy();
  }
});

it('recognizes URLs without absorbing Markdown delimiters or sentence punctuation', () => {
  const text =
    'URL: https://example.com/a_(b)。 [x](https://example.org/path?q=1#p) <http://example.net> `www.example.jp`';
  const links = httpLinks(text);
  expect(links.map((link) => text.slice(link.from, link.to))).toEqual([
    'https://example.com/a_(b)',
    'https://example.org/path?q=1#p',
    'http://example.net',
    'www.example.jp',
  ]);
  expect(links.map((link) => link.url)).toEqual([
    'https://example.com/a_(b)',
    'https://example.org/path?q=1#p',
    'http://example.net/',
    'https://www.example.jp/',
  ]);
  expect(
    httpLinks('file:///C:/a javascript:alert(1) https://user:pass@example.com'),
  ).toEqual([]);
});

it('linkifies plain/code text without changing visible text or existing link targets', () => {
  const fragment = sanitizePreview(
    '<p>URL: https://example.com/a_(b)。</p><pre><code>https://example.org/path</code></pre><a href="https://example.net">label</a><a href="javascript:bad()">https://example.invalid</a>',
  );
  const before = fragment.textContent;
  linkifyHttpText(fragment);
  expect(fragment.textContent).toBe(before);
  expect(
    [...fragment.querySelectorAll('a[href]')].map((a) =>
      a.getAttribute('href'),
    ),
  ).toEqual([
    'https://example.com/a_(b)',
    'https://example.org/path',
    'https://example.net',
  ]);
  expect(fragment.querySelector('a a')).toBeNull();
  expect(fragment.querySelector('script,img')).toBeNull();
});

it('requires a trusted plain click and preserves drag selection, modifiers and other buttons', () => {
  const click = {
    isTrusted: true,
    button: 0,
    detail: 1,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  expect(isLinkClick(click as MouseEvent, false)).toBe(true);
  expect(isLinkClick(click as MouseEvent, true)).toBe(false);
  for (const override of [
    { isTrusted: false },
    { button: 1 },
    { detail: 2 },
    { ctrlKey: true },
    { altKey: true },
    { shiftKey: true },
    { metaKey: true },
  ])
    expect(isLinkClick({ ...click, ...override } as MouseEvent, false)).toBe(
      false,
    );
});

it('decorates source URLs after edits/reload and never launches from synthetic events', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const open = vi.fn().mockResolvedValue(undefined);
  const text = '参照 [x](https://example.com/a_(b))';
  const editor = new MarkdownEditor(host, text, false, vi.fn(), undefined, {
    open,
    report: vi.fn(),
  });
  try {
    const link = host.querySelector<HTMLElement>('.cm-http-link')!;
    expect(link.textContent).toBe('https://example.com/a_(b)');
    expect(link.dataset.httpUrl).toBe('https://example.com/a_(b)');
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(open).not.toHaveBeenCalled();
    expect(editor.view.state.doc.toString()).toBe(text);
    expect(editor.canUndo).toBe(false);
    editor.view.dispatch({
      changes: { from: 0, to: text.length, insert: 'www.example.org' },
      selection: EditorSelection.cursor(0),
    });
    expect(
      host.querySelector<HTMLElement>('.cm-http-link')?.dataset.httpUrl,
    ).toBe('https://www.example.org/');
    editor.reload('https://example.net', true, vi.fn());
    expect(
      host.querySelector<HTMLElement>('.cm-http-link')?.dataset.httpUrl,
    ).toBe('https://example.net/');
  } finally {
    editor.view.destroy();
  }
});
