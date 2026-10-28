import { collectPreviewBlocks, type PreviewBlock } from './scroll-sync';
import { mathOrigin } from './math-preview';

/** Source positions for the sanitized DOM of one immutable preview snapshot. */
export class PreviewLocations {
  private readonly elements = new WeakMap<Element, number>();
  private readonly starts = [0];
  readonly blocks: PreviewBlock[];
  constructor(
    private readonly source: string,
    root: ParentNode,
  ) {
    for (let i = 0; i < source.length; i++)
      if (source[i] === '\n') this.starts.push(i + 1);
    this.blocks = collectPreviewBlocks(root, this.starts.length, this.elements);
  }
  get lineCount(): number {
    return this.starts.length;
  }
  offsetAt(node: Node, offset = 0): number | null {
    const math = mathOrigin(node);
    if (
      math &&
      math.from + math.raw.length <= this.source.length &&
      this.source.slice(math.from, math.from + math.raw.length) === math.raw
    )
      return math.from;
    let block = node.nodeType === 1 ? (node as Element) : node.parentElement;
    while (block && !this.elements.has(block)) block = block.parentElement;
    if (!block) return null;
    const line = this.elements.get(block)!;
    let from = this.starts[line - 1];
    const next = this.blocks.find((candidate) => candidate.line > line);
    let to = next ? this.starts[next.line - 1] : this.source.length;
    if (block.tagName === 'PRE') {
      const end = this.source.indexOf('\n', from);
      if (end >= 0 && /^ {0,3}(`{3,}|~{3,})/.test(this.source.slice(from, end)))
        from = end + 1;
    }
    const fallback = from;

    // A table row can contain the same text in more than one column.
    const parent = node.nodeType === 1 ? (node as Element) : node.parentElement;
    const cell = parent?.closest('td,th');
    if (cell && block.contains(cell)) {
      const end = this.source.indexOf('\n', from);
      const cells = tableCells(this.source.slice(from, end < 0 ? to : end));
      const siblings = [...cell.parentElement!.children];
      if (cells.length === siblings.length) {
        const range = cells[siblings.indexOf(cell)];
        if (range) {
          to = from + range.to;
          from += range.from;
        }
      }
    }
    if (node.nodeType !== 3) return from;
    const text = node.nodeValue ?? '';
    const cursor = Number.isInteger(offset)
      ? Math.max(0, Math.min(text.length, offset))
      : 0;
    let searchFrom = from;
    // Matching preceding text nodes disambiguates repeated plain/emphasized words.
    const walker = node.ownerDocument!.createTreeWalker(block, 4);
    for (
      let previous = walker.nextNode();
      previous && previous !== node;
      previous = walker.nextNode()
    ) {
      if (cell && !cell.contains(previous)) continue;
      const value = previous.nodeValue ?? '';
      if (!value.trim()) continue;
      const found = this.source.indexOf(value, searchFrom);
      if (found >= 0 && found + value.length <= to)
        searchFrom = found + value.length;
    }
    const match = (value: string, relative: number) => {
      if (!value.trim()) return null;
      const first = this.source.indexOf(value, searchFrom);
      if (first < 0 || first + value.length > to) return null;
      const again = this.source.indexOf(value, first + 1);
      if (again >= 0 && again + value.length <= to) return null;
      return first + relative;
    };
    const exact = match(text, cursor);
    if (exact !== null) return exact;
    // Blockquotes and indented code may insert prefixes between displayed lines.
    const lineFrom = text.lastIndexOf('\n', cursor - 1) + 1;
    const lineEnd = text.indexOf('\n', cursor);
    const onLine = match(
      text.slice(lineFrom, lineEnd < 0 ? text.length : lineEnd),
      cursor - lineFrom,
    );
    if (onLine !== null) return onLine;
    // Decoded entities can prevent a whole-node match; use an unambiguous word.
    for (const word of text.matchAll(/[\p{L}\p{N}_]+/gu)) {
      if (word.index <= cursor && cursor <= word.index + word[0].length) {
        const found = match(word[0], cursor - word.index);
        if (found !== null) return found;
      }
    }
    return fallback;
  }
}

function tableCells(row: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  let from = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\') {
      i++;
      continue;
    }
    if (row[i] === '|') {
      ranges.push({ from, to: i });
      from = i + 1;
    }
  }
  ranges.push({ from, to: row.length });
  if (ranges.length > 1 && !row.slice(ranges[0].from, ranges[0].to).trim())
    ranges.shift();
  if (
    ranges.length > 1 &&
    !row.slice(ranges.at(-1)!.from, ranges.at(-1)!.to).trim()
  )
    ranges.pop();
  return ranges;
}
