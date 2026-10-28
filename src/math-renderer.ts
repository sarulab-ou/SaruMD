import katex from 'katex';
import type { Token, TokenizerAndRendererExtension, Tokens } from 'marked';

const MAX_TEX_LENGTH = 16384;
const MAX_FORMULAS = 1000;
const MAX_MATHML_LENGTH = 2 * 1024 * 1024;

interface MathToken extends Tokens.Generic {
  text: string;
  display: boolean;
}

function formula(source: string, block: boolean): MathToken | undefined {
  const prefix = block ? /^( {0,3})\$\$/.exec(source) : /^\$/.exec(source);
  if (!prefix) return;
  const start = prefix[0].length;
  const display = block || source.startsWith('$$');
  const open = display && !block ? 2 : start;
  for (
    let i = open;
    i < Math.min(source.length, open + MAX_TEX_LENGTH + 1);
    i++
  ) {
    if (source[i] === '\\') {
      i++;
      continue;
    }
    if (!display && source[i] === '\n') return;
    if (source[i] !== '$' || (display && source[i + 1] !== '$')) continue;
    if (!display && /\d/.test(source[i + 1] ?? '')) continue;
    const end = i + (display ? 2 : 1);
    const text = source.slice(open, i);
    if (!text.trim()) return;
    return {
      type: block ? 'displayMath' : 'inlineMath',
      raw: source.slice(0, end),
      text,
      display,
    };
  }
}

/** One conversion gets an isolated expansion/output budget and fresh macros. */
export function mathExtensions(
  escape: (value: string) => string,
  mark: (html: string, token: Token) => string = (html) => html,
  sourceOffset: (token: Token) => number | undefined = () => undefined,
): TokenizerAndRendererExtension[] {
  let count = 0;
  let output = 0;
  let exhausted = false;
  const renderer = (token: Tokens.Generic) => {
    const math = token as MathToken;
    if (exhausted) return escape(math.raw);
    let html = '';
    if (++count > MAX_FORMULAS || output >= MAX_MATHML_LENGTH) exhausted = true;
    else {
      try {
        html = katex.renderToString(math.text, {
          output: 'mathml',
          displayMode: math.display,
          throwOnError: true,
          trust: false,
          strict: 'ignore',
          maxExpand: 1000,
          maxSize: 20,
          macros: {},
        });
        output += html.length;
        if (output > MAX_MATHML_LENGTH) {
          html = '';
          exhausted = true;
        }
      } catch {
        /* Keep the TeX source visible if a formula cannot be rendered. */
      }
    }
    return mark(
      `<span data-winmd-math="${escape(html)}" data-winmd-display="${math.display ? 'block' : 'inline'}" data-winmd-from="${sourceOffset(math) ?? ''}">${escape(math.raw)}</span>`,
      math,
    );
  };
  return [
    {
      name: 'displayMath',
      level: 'block',
      start: (source) => source.search(/(?:^|\n) {0,3}\$\$/),
      tokenizer: (source) => formula(source, true),
      renderer,
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start: (source) => source.indexOf('$'),
      tokenizer: (source) => formula(source, false),
      renderer,
    },
  ];
}
