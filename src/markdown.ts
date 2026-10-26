import { Marked } from 'marked';

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
