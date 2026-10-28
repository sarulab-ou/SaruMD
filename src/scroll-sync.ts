import type { EditorView } from '@codemirror/view';

export interface ScrollPosition {
  top: number;
  max: number;
  line: number;
}

export interface ScrollPane {
  events: EventTarget;
  input: EventTarget;
  outerInput?: EventTarget;
  position(): ScrollPosition;
  topForLine(line: number): number;
  setTop(top: number): void;
}

export interface PreviewBlock {
  line: number;
  element: Element;
}

/** Consume renderer-generated locations; no internal attributes enter print output. */
export function collectPreviewBlocks(
  root: ParentNode,
  lines: number,
  locations?: WeakMap<Element, number>,
): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  for (const element of root.querySelectorAll('[data-winmd-line]')) {
    const value = element.getAttribute('data-winmd-line')!;
    element.removeAttribute('data-winmd-line');
    const line = Number(value);
    if (
      /^[1-9]\d*$/.test(value) &&
      Number.isSafeInteger(line) &&
      line <= lines
    ) {
      locations?.set(element, line);
      blocks.push({ line, element });
    }
  }
  blocks.sort((a, b) => a.line - b.line);
  return blocks.filter(
    (block, i) => i === 0 || blocks[i - 1].line !== block.line,
  );
}

// Query just the neighboring anchors, even for documents with thousands of list items.
function interpolate(
  value: number,
  count: number,
  input: (index: number) => number,
  output: (index: number) => number,
): number {
  if (!count) return 0;
  if (value <= input(0)) return output(0);
  if (value >= input(count - 1)) return output(count - 1);
  let low = 0;
  let high = count - 1;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (input(mid) <= value) low = mid;
    else high = mid;
  }
  const distance = input(high) - input(low);
  const fraction = distance > 0 ? (value - input(low)) / distance : 0;
  return output(low) + fraction * (output(high) - output(low));
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function editorScrollPane(
  view: EditorView,
  sourceLines: () => readonly number[],
): ScrollPane {
  const scroller = view.scrollDOM;
  const offset = () =>
    scroller.scrollTop +
    view.documentTop -
    scroller.getBoundingClientRect().top;
  const point = (index: number) => {
    const anchors = sourceLines();
    if (index === 0) return { line: 1, top: offset() };
    if (index === anchors.length + 1)
      return {
        line: view.state.doc.lines + 1,
        top: scroller.scrollHeight - view.documentPadding.bottom,
      };
    const line = Math.min(view.state.doc.lines, anchors[index - 1]);
    return {
      line,
      top: offset() + view.lineBlockAt(view.state.doc.line(line).from).top,
    };
  };
  return {
    events: scroller,
    input: view.dom,
    position() {
      return {
        top: scroller.scrollTop,
        max: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
        line: interpolate(
          scroller.scrollTop,
          sourceLines().length + 2,
          (i) => point(i).top,
          (i) => point(i).line,
        ),
      };
    },
    topForLine(line) {
      return interpolate(
        line,
        sourceLines().length + 2,
        (i) => point(i).line,
        (i) => point(i).top,
      );
    },
    setTop(top) {
      scroller.scrollTop = top;
    },
  };
}

export function previewScrollPane(
  frame: HTMLIFrameElement,
  blocks: () => readonly PreviewBlock[],
  lines: () => number,
): ScrollPane {
  const win = frame.contentWindow!;
  const doc = frame.contentDocument!;
  const max = () =>
    Math.max(
      0,
      doc.documentElement.scrollHeight - doc.documentElement.clientHeight,
    );
  const point = (index: number) => {
    const anchors = blocks();
    if (index === 0) return { line: 1, top: 0 };
    if (index === anchors.length + 1)
      return {
        line: lines() + 1,
        top:
          doc.querySelector('article')!.getBoundingClientRect().bottom +
          win.scrollY,
      };
    return {
      line: anchors[index - 1].line,
      top: anchors[index - 1].element.getBoundingClientRect().top + win.scrollY,
    };
  };
  return {
    events: win,
    input: doc,
    outerInput: frame,
    position() {
      const count = blocks().length + 2;
      return {
        top: win.scrollY,
        max: max(),
        line: interpolate(
          win.scrollY,
          count,
          (i) => point(i).top,
          (i) => point(i).line,
        ),
      };
    },
    topForLine(line) {
      return interpolate(
        line,
        blocks().length + 2,
        (i) => point(i).line,
        (i) => point(i).top,
      );
    },
    setTop(top) {
      win.scrollTo(0, top);
    },
  };
}

/** Mirror the last actively scrolled pane, suppressing resulting scroll events. */
export class ScrollSync {
  private leader = 0;
  private frame: number | undefined;
  private expected: (number | undefined)[] = [];
  private readonly tops: number[] = [];
  private anchor: ScrollPosition | undefined;
  private alignLeader = false;
  private destroyed = false;
  private readonly remove: (() => void)[] = [];
  constructor(
    private readonly panes: readonly [ScrollPane, ScrollPane],
    private readonly enabled: () => boolean,
  ) {
    panes.forEach((pane, index) => {
      this.tops[index] = pane.position().top;
      const listen = (
        target: EventTarget,
        name: string,
        handler: () => void,
      ) => {
        target.addEventListener(name, handler, {
          passive: true,
          capture: true,
        });
        this.remove.push(() => target.removeEventListener(name, handler, true));
      };
      const interact = () => {
        this.leader = index;
        this.expected[index] = undefined;
        if (this.enabled()) this.anchor = pane.position();
      };
      for (const input of [
        pane.input,
        ...(pane.outerInput ? [pane.outerInput] : []),
      ])
        for (const name of [
          'wheel',
          'pointerdown',
          'mousedown',
          'touchstart',
          'keydown',
          'focusin',
        ])
          listen(input, name, interact);
      listen(pane.events, 'scroll', () => {
        const top = pane.position().top;
        if (Math.abs(top - this.tops[index]) < 0.5) return;
        this.tops[index] = top;
        // CodeMirror can adjust the follower again after measuring wrapped lines.
        // Only wheel/keyboard/pointer/focus input transfers control to that pane.
        if (index !== this.leader) return;
        const expected = this.expected[index];
        if (expected !== undefined && Math.abs(top - expected) < 1.5) return;
        this.anchor = pane.position();
        this.refresh(false);
      });
    });
  }
  refresh(alignLeader = false): void {
    if (this.destroyed) return;
    this.alignLeader ||= alignLeader;
    // Preview repaints/layout can clamp scrollTop without a user scrolling.
    const follower = 1 - this.leader;
    this.expected[follower] = this.panes[follower].position().top;
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (!this.enabled()) return;
      const source = this.panes[this.leader];
      const targetIndex = 1 - this.leader;
      const target = this.panes[targetIndex];
      const position = this.anchor ?? source.position();
      this.anchor = position;
      const other = target.position();
      const start = position.top <= 0.5;
      const end = position.max > 0 && position.top >= position.max - 0.5;
      if (this.alignLeader) {
        const own = source.position();
        const top = start
          ? 0
          : end
            ? own.max
            : clamp(source.topForLine(position.line), own.max);
        if (Number.isFinite(top) && Math.abs(top - own.top) >= 0.5) {
          this.expected[this.leader] = top;
          source.setTop(top);
          this.expected[this.leader] = source.position().top;
        }
      }
      this.alignLeader = false;
      const top = start
        ? 0
        : end
          ? other.max
          : clamp(target.topForLine(position.line), other.max);
      if (!Number.isFinite(top) || Math.abs(top - other.top) < 0.5) return;
      // Set before the write as well: some embedders dispatch scrolling synchronously.
      this.expected[targetIndex] = top;
      target.setTop(top);
      this.expected[targetIndex] = target.position().top;
    });
  }
  destroy(): void {
    this.destroyed = true;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    for (const remove of this.remove) remove();
  }
}
