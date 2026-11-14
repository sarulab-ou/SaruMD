export type ViewMode = 'split' | 'editor' | 'viewer';

export class ViewModes {
  private value: ViewMode = 'split';
  private readonly source: HTMLElement;
  private readonly viewer: HTMLElement;
  private readonly divider: HTMLElement;

  constructor(
    private readonly split: HTMLElement,
    private readonly menu: HTMLElement,
    private readonly hooks: {
      beforeChange: (visible: readonly [boolean, boolean]) => void;
      changed: (mode: ViewMode, previous: ViewMode) => void;
    },
  ) {
    this.source = split.querySelector('.source-pane')!;
    this.viewer = split.querySelector('.preview-pane')!;
    this.divider = split.querySelector('#divider')!;
    this.render();
  }

  get mode(): ViewMode {
    return this.value;
  }

  set(mode: ViewMode): void {
    const previous = this.value;
    if (mode !== previous) {
      // Capture the visible source position before changing widths or hiding a pane.
      this.hooks.beforeChange([mode !== 'viewer', mode !== 'editor']);
      this.value = mode;
      this.render();
    }
    this.hooks.changed(mode, previous);
  }

  showEditor(): void {
    if (this.value === 'viewer') this.set('split');
  }

  private render(): void {
    this.split.dataset.viewMode = this.value;
    this.source.hidden = this.value === 'viewer';
    this.viewer.hidden = this.value === 'editor';
    this.divider.hidden = this.value !== 'split';
    for (const mode of ['split', 'editor', 'viewer'] as const) {
      const button = this.menu.querySelector<HTMLButtonElement>(
        `#view-${mode}`,
      )!;
      button.setAttribute('aria-checked', String(mode === this.value));
      button.querySelector('[aria-hidden]')!.textContent =
        mode === this.value ? '✓' : '';
    }
  }
}
