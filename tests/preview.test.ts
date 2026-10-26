import { describe, it, expect } from 'vitest';
import { markdownHtml, safeHttpUrl } from '../src/markdown';
import { sanitizePreview } from '../src/preview';

describe('untrusted Markdown', () => {
  it('renders GFM with a read-only task list', () => {
    const fragment = sanitizePreview(
      markdownHtml(
        '# 見出し\n\n~~取消~~ **強調** *斜体*\n\n- [x] 作業\n\n> 引用\n\n---\n\n|a|b|\n|-|-|\n|1|2|\n\n```ts\nconst x=1;\n```\n',
      ),
    );
    for (const tag of [
      'h1',
      'del',
      'strong',
      'em',
      'input[disabled]',
      'blockquote',
      'hr',
      'table',
      'pre code',
    ])
      expect(fragment.querySelector(tag)).not.toBeNull();
  });
  it('escapes raw HTML and does not expose event handlers or CSS', () => {
    const attack =
      '<script>window.__TAURI_INTERNALS__.invoke("save_document")</script>\n<img src="https://tracking.invalid/a" onerror="alert(1)">\n<style>body{display:none}</style><iframe src="file:///c:/secret"></iframe>';
    const fragment = sanitizePreview(markdownHtml(attack));
    expect(fragment.querySelector('script,img,style,iframe')).toBeNull();
    expect(fragment.textContent).toContain('<script>');
  });
  it('sanitizes again even if the renderer emitted an unsafe string', () => {
    const fragment = sanitizePreview(
      '<p style="position:fixed" onclick="alert(1)">x</p><iframe src="http://evil"></iframe><img src="http://tracking" onerror="x"><a href="javascript:alert(1)">x</a>',
    );
    expect(
      fragment.querySelector('[style],[onclick],[src],[onerror],iframe'),
    ).toBeNull();
    expect(fragment.querySelector('a')?.hasAttribute('href')).toBe(false);
  });
  it('does not assign image sources while parsing; blocks dangerous URLs', () => {
    const fragment = sanitizePreview(
      markdownHtml(
        '![画像](https://tracking.invalid/pixel.png)\n\n[x](javascript:alert%281%29)',
      ),
    );
    const image = fragment.querySelector('img')!;
    expect(image.getAttribute('src')).toBeNull();
    expect(image.getAttribute('data-winmd-src')).toBe(
      'https://tracking.invalid/pixel.png',
    );
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///C:/x',
      'ms-settings:display',
      '//example.com',
      'https://user:pass@example.com',
    ])
      expect(safeHttpUrl(raw)).toBeNull();
    expect(safeHttpUrl('https://example.com/日本語')).toContain(
      'https://example.com/',
    );
  });
});
