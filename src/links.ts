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

/** Local references remain inert metadata until an intentional click reaches Rust. */
export function safeLinkReference(raw: string): string | null {
  const reference = raw.trim();
  if (
    !reference ||
    reference.length > 8192 ||
    [...reference].some(
      (c) =>
        c.charCodeAt(0) < 32 ||
        (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
    )
  )
    return null;
  if (/^https?:/i.test(reference)) return safeHttpUrl(reference);
  if (/^[#?]/.test(reference) || /^(?:\/\/|\\\\)/.test(reference)) return null;
  if (/^file:/i.test(reference)) {
    try {
      const url = new URL(reference);
      return !url.host && !url.search && url.pathname ? reference : null;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(reference) && !/^[a-z]:[/\\]/i.test(reference))
    return null;
  return reference;
}

export const httpLinkPattern = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+/gi;

/** Match visible URL text without swallowing Markdown delimiters or sentence punctuation. */
export function httpLinks(
  text: string,
): { from: number; to: number; url: string }[] {
  const links: { from: number; to: number; url: string }[] = [];
  for (const match of text.matchAll(new RegExp(httpLinkPattern))) {
    const candidate = match[0];
    const surplus: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
    const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    for (const character of candidate) {
      if (closing[character]) surplus[closing[character]]--;
      else if (character in surplus) surplus[character]++;
    }
    let end = candidate.length;
    while (end) {
      const last = candidate[end - 1];
      if (
        /[.,;:!?。、，；：！？）】》」』〉]/.test(last) ||
        surplus[last] > 0
      ) {
        end--;
        if (last in surplus) surplus[last]--;
      } else break;
    }
    const raw = candidate.slice(0, end);
    const url = safeHttpUrl(/^www\./i.test(raw) ? `https://${raw}` : raw);
    if (url)
      links.push({ from: match.index, to: match.index + raw.length, url });
  }
  return links;
}

/** Both panes require an intentional user click; selecting text must not launch an app. */
export function isLinkClick(event: MouseEvent, hasSelection: boolean): boolean {
  return (
    event.isTrusted &&
    event.button === 0 &&
    event.detail <= 1 &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    !hasSelection
  );
}

/** Also make URLs in code and other plain preview text clickable. */
export function linkifyHttpText(root: DocumentFragment): void {
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (!node.parentElement?.closest('a,math,.winmd-math-error'))
      nodes.push(node as Text);
  for (const node of nodes) {
    const text = node.data;
    const links = httpLinks(text);
    if (!links.length) continue;
    const fragment = document.createDocumentFragment();
    let from = 0;
    for (const link of links) {
      fragment.append(text.slice(from, link.from));
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.rel = 'noreferrer noopener';
      anchor.textContent = text.slice(link.from, link.to);
      fragment.append(anchor);
      from = link.to;
    }
    fragment.append(text.slice(from));
    node.replaceWith(fragment);
  }
}
