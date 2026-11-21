import type { EditorView } from '@codemirror/view';
import type { ScrollSync } from './scroll-sync';

export type ZoomCommand = 'in' | 'out' | 'reset';

export function zoomShortcut(
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'code'
    | 'ctrlKey'
    | 'altKey'
    | 'metaKey'
    | 'isComposing'
    | 'keyCode'
  >,
): ZoomCommand | null {
  if (
    !event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.isComposing ||
    event.keyCode === 229
  )
    return null;
  if ([';', '+', '=', 'Add'].includes(event.key) || event.code === 'NumpadAdd')
    return 'in';
  if (['-', 'Subtract'].includes(event.key) || event.code === 'NumpadSubtract')
    return 'out';
  if (event.key === '0') return 'reset';
  return null;
}

export function boundedZoom(value: number): number {
  return Number.isFinite(value)
    ? Math.max(50, Math.min(300, Math.round(value / 10) * 10))
    : 100;
}

/** One display scale per document window; document text and undo state are untouched. */
export class DocumentZoom {
  private value = 100;
  constructor(private readonly changed: (percent: number) => void) {}
  get percent(): number {
    return this.value;
  }
  set(percent: number): void {
    const value = boundedZoom(percent);
    if (value === this.value) return;
    this.value = value;
    this.changed(value);
  }
  apply(command: ZoomCommand): void {
    this.set(
      command === 'reset' ? 100 : this.value + (command === 'in' ? 10 : -10),
    );
  }
}

export function setupDocumentZoom(
  root: HTMLElement,
  editor: EditorView,
  preview: { setZoom(percent: number): void },
  scroll: Pick<ScrollSync, 'capture' | 'restore'>,
  beforeChange: () => void = () => {},
): DocumentZoom {
  return new DocumentZoom((percent) => {
    const position = scroll.capture();
    beforeChange();
    root.style.setProperty('--document-scale', String(percent / 100));
    preview.setZoom(percent);
    editor.requestMeasure();
    scroll.restore(position);
    const doc = root.ownerDocument;
    const label = doc.querySelector('#zoom-level');
    if (label) label.textContent = `${percent}%`;
    doc.querySelector<HTMLButtonElement>('#zoom-in')!.disabled = percent >= 300;
    doc.querySelector<HTMLButtonElement>('#zoom-out')!.disabled = percent <= 50;
  });
}
