import { expect, it } from 'vitest';
import { mappedMarkdownHtml, markdownHtml } from '../src/markdown';
import { sanitizePreview } from '../src/preview';
import { PreviewLocations } from '../src/preview-location';

it('renders inline and multiline display TeX as sanitized native MathML', () => {
  const source = String.raw`文中の数式 $E=mc^2$ です。

$$
\frac{1}{2} + \sqrt{x^2+y^2}
$$

$$\begin{pmatrix}a&b\\c&d\end{pmatrix}$$`;
  const fragment = sanitizePreview(mappedMarkdownHtml(source));
  expect(fragment.querySelectorAll('math')).toHaveLength(3);
  expect(fragment.querySelectorAll('.winmd-math-inline')).toHaveLength(1);
  expect(fragment.querySelectorAll('.winmd-math-block')).toHaveLength(2);
  expect(fragment.querySelector('math')!.namespaceURI).toBe(
    'http://www.w3.org/1998/Math/MathML',
  );
  for (const tag of ['msup', 'mfrac', 'msqrt', 'mtable', 'mtd'])
    expect(fragment.querySelector(tag)).not.toBeNull();
  expect(
    fragment.querySelector(
      '[data-winmd-math],[data-winmd-from],[data-winmd-display]',
    ),
  ).toBeNull();
  const locations = new PreviewLocations(source, fragment);
  const block = fragment.querySelectorAll('.winmd-math-block')[0];
  expect(locations.offsetAt(block.querySelector('mfrac')!)).toBe(
    source.indexOf('$$'),
  );
});

it('leaves code, escaped dollars, currency, raw HTML and unmatched delimiters literal', () => {
  const source = [
    '`$x$`',
    '```tex\n$$y$$\n```',
    '\\$z$',
    '料金 $100 と $200',
    '$unclosed',
    '<div>$a$</div>',
    '    $$code$$',
  ].join('\n\n');
  const fragment = sanitizePreview(markdownHtml(source));
  expect(fragment.querySelector('math')).toBeNull();
  expect(fragment.querySelector('code')!.textContent).toBe('$x$');
  expect(fragment.textContent).toContain('$$y$$');
  expect(fragment.textContent).toContain('料金 $100 と $200');
  expect(fragment.textContent).toContain('<div>$a$</div>');
});

it('handles adjacent inline formulas, internal escapes and repeated identical formulas', () => {
  const source = String.raw`$x$$y$ と $a\$b$ と $x$`;
  const fragment = sanitizePreview(mappedMarkdownHtml(source));
  expect(fragment.querySelectorAll('math')).toHaveLength(4);
  const locations = new PreviewLocations(source, fragment);
  const last = fragment.querySelectorAll('math')[3].querySelector('mi')!;
  expect(locations.offsetAt(last)).toBe(source.lastIndexOf('$x$'));
});

it('accepts spaces inside delimiters and standard integral/aligned notation', () => {
  const source = String.raw`余白付き $ x + 1 $ です。

$$
\begin{aligned}
\int_0^1 x^2\,dx &= \frac{1}{3} \\
a^2+b^2 &= c^2
\end{aligned}
$$`;
  const fragment = sanitizePreview(markdownHtml(source));
  expect(fragment.querySelectorAll('math')).toHaveLength(2);
  expect(fragment.querySelector('.winmd-math-error')).toBeNull();
  expect(fragment.querySelector('mtable')).not.toBeNull();
  expect(fragment.querySelector('msubsup')).not.toBeNull();
});

it('keeps malformed and excessive expansion input visible without failing the preview', () => {
  const source = String.raw`$\frac{1}{$

$\def\x{\x}\x$

正常な数式 $x+1$`;
  const fragment = sanitizePreview(markdownHtml(source));
  expect(fragment.querySelectorAll('.winmd-math-error')).toHaveLength(2);
  expect(fragment.querySelectorAll('math')).toHaveLength(1);
  expect(fragment.textContent).toContain('\u005cfrac{1}{');
});

it('limits formula count and does not share user-defined macros between formulas', () => {
  const html = markdownHtml(
    Array.from({ length: 1003 }, () => '$x$').join(' '),
  );
  expect(html.match(/data-winmd-math=""/g)).toHaveLength(1);
  expect(html.match(/data-winmd-math=/g)).toHaveLength(1001);
  const source = String.raw`$\gdef\WinMDMacro{123}\WinMDMacro$ $\WinMDMacro$`;
  const fragment = sanitizePreview(markdownHtml(source));
  expect(fragment.querySelectorAll('math')).toHaveLength(1);
  expect(fragment.querySelectorAll('.winmd-math-error')).toHaveLength(1);
});

it('leaves expressions above the length limit literal', () => {
  const source = '$' + 'x'.repeat(16385) + '$';
  const html = markdownHtml(source);
  expect(html).not.toContain('data-winmd-math');
  expect(html).toContain(source);
});

it('never enables TeX URLs, images, HTML attributes, scripts, or raw MathML', () => {
  const source = String.raw`$\href{javascript:alert(1)}{x}$

$\includegraphics{https://tracking.invalid/x}$

$\htmlStyle{background:url(https://tracking.invalid/x)}{x}$

$\text{<img src=x onerror=alert(1)>}$

<math href="https://tracking.invalid/x"><mi>x</mi></math>`;
  const fragment = sanitizePreview(mappedMarkdownHtml(source));
  expect(
    fragment.querySelector(
      'a,img,svg,script,style,iframe,[href],[src],[style],[onclick],[onerror]',
    ),
  ).toBeNull();
  expect(fragment.textContent).toContain('<math href=');
  const injected = sanitizePreview(
    '<span data-winmd-math="&lt;img src=&quot;https://tracking.invalid/x&quot; onerror=&quot;bad()&quot;&gt;">original</span>',
  );
  expect(injected.querySelector('img,[src],[onerror]')).toBeNull();
  expect(injected.querySelector('.winmd-math-error')?.textContent).toBe(
    'original',
  );
});
