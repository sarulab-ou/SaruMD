import { expect, it } from 'vitest';
import { mappedMarkdownHtml } from '../src/markdown';
import { sanitizePreview } from '../src/preview';
import { PreviewLocations } from '../src/preview-location';

function setup(source: string) {
  const fragment = sanitizePreview(mappedMarkdownHtml(source));
  const locations = new PreviewLocations(source, fragment);
  return { fragment, locations };
}

it('maps headings and repeated emphasized text to the actual source character', () => {
  const source = '# 見出し\n\n同じ **同じ** 次の文字\n';
  const { fragment, locations } = setup(source);
  expect(locations.offsetAt(fragment.querySelector('h1')!.firstChild!, 2)).toBe(
    source.indexOf('見出し') + 2,
  );
  expect(
    locations.offsetAt(fragment.querySelector('strong')!.firstChild!, 1),
  ).toBe(source.indexOf('**同じ**') + 3);
  expect(fragment.querySelector('[data-winmd-line]')).toBeNull();
});

it('maps later lines in fenced code and does not confuse the fence language with code', () => {
  const source = '```js\njs\nconst n = 2;\n```\n\n次の段落';
  const { fragment, locations } = setup(source);
  const node = fragment.querySelector('pre code')!.firstChild!;
  expect(locations.offsetAt(node, 1)).toBe(source.indexOf('\njs\n') + 2);
  expect(locations.offsetAt(node, node.textContent!.indexOf('2'))).toBe(
    source.indexOf('2'),
  );
});

it('finds quoted lines despite stripped prefixes and decoded HTML entities', () => {
  const source = '> first\n> 日本語\n\nA &amp; B';
  const { fragment, locations } = setup(source);
  expect(
    locations.offsetAt(
      fragment.querySelector('blockquote p')!.firstChild!,
      'first\n'.length + 1,
    ),
  ).toBe(source.indexOf('日本語') + 1);
  const node = fragment.querySelectorAll('p')[1].firstChild!;
  expect(locations.offsetAt(node, node.textContent!.indexOf('B'))).toBe(
    source.indexOf('B'),
  );
});

it('disambiguates identical text in different table columns and rows', () => {
  const source = '| 列 | 列 |\n|---|---|\n| 同じ | 同じ |\n| 同じ | 同じ |\n';
  const { fragment, locations } = setup(source);
  const cell = fragment.querySelectorAll('td')[3];
  expect(locations.offsetAt(cell.firstChild!, 1)).toBe(
    source.lastIndexOf('同じ') + 1,
  );
});

it('uses the corresponding block start for ambiguous text and images', () => {
  const source =
    '# 題\n\n[label](https://example.com/bar)bar\n\n![画像](image.png)';
  const { fragment, locations } = setup(source);
  expect(locations.offsetAt(fragment.querySelector('p')!.lastChild!, 1)).toBe(
    source.indexOf('[label]'),
  );
  expect(locations.offsetAt(fragment.querySelector('img')!)).toBe(
    source.indexOf('![画像]'),
  );
  expect(locations.offsetAt(document.createTextNode('unrelated'))).toBeNull();
});
