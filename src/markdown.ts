import { Marked, Renderer, type Token, type Tokens } from 'marked';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

const parser = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html: (token) => escapeHtml(token.text),
    // Never hand an unvalidated src to a DOM parser: even a detached image could fetch.
    image: (token) =>
      `<img data-winmd-src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}">`,
  },
});

export function markdownHtml(text: string): string {
  return parser.parse(text) as string;
}

/** Generated block locations only; raw Markdown HTML is still escaped. */
export function mappedMarkdownHtml(text: string): string {
  const source = text.replace(/\r\n?/g, '\n');
  const starts = [0];
  for (let i = 0; i < source.length; i++)
    if (source[i] === '\n') starts.push(i + 1);
  const locations = new WeakMap<object, number>();
  const lineAt = (offset: number) => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid;
    }
    return low + 1;
  };
  const locate = (tokens: Token[], from: number, to: number) => {
    let cursor = from;
    for (const token of tokens) {
      if (!token.raw) continue;
      const offset = source.indexOf(token.raw, cursor);
      if (offset < 0 || offset + token.raw.length > to) continue;
      locations.set(token, lineAt(offset));
      if (token.type === 'list')
        locate((token as Tokens.List).items, offset, offset + token.raw.length);
      else if (token.type === 'list_item' || token.type === 'blockquote')
        locate(token.tokens as Token[], offset, offset + token.raw.length);
      cursor = offset + token.raw.length;
    }
  };
  const mark = (html: string, token: Token) => {
    const line = locations.get(token);
    return line === undefined
      ? html
      : html.replace(/^<([a-z0-9]+)/, `<$1 data-winmd-line="${line}"`);
  };
  // A separate instance avoids accumulating renderer extensions between conversions.
  const mapped = new Marked({
    gfm: true,
    async: false,
    renderer: {
      html: (token) => escapeHtml(token.text),
      image: (token) =>
        `<img data-winmd-src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}">`,
      heading(token) {
        return mark(Renderer.prototype.heading.call(this, token), token);
      },
      paragraph(token) {
        return mark(Renderer.prototype.paragraph.call(this, token), token);
      },
      code(token) {
        return mark(Renderer.prototype.code.call(this, token), token);
      },
      hr(token) {
        return mark(Renderer.prototype.hr.call(this, token), token);
      },
      blockquote(token) {
        return mark(Renderer.prototype.blockquote.call(this, token), token);
      },
      list(token) {
        return mark(Renderer.prototype.list.call(this, token), token);
      },
      listitem(token) {
        return mark(Renderer.prototype.listitem.call(this, token), token);
      },
      table(token) {
        let row = 0;
        const line = locations.get(token);
        const html = Renderer.prototype.table.call(this, token);
        return mark(
          line === undefined
            ? html
            : html.replace(/<tr>/g, () => {
                const current = line + (row === 0 ? 0 : row + 1);
                row++;
                return `<tr data-winmd-line="${current}">`;
              }),
          token,
        );
      },
    },
  });
  const tokens = mapped.lexer(source);
  locate(tokens, 0, source.length);
  return mapped.parser(tokens);
}

export function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return /^(https?:)$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
