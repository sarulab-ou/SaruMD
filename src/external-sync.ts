/** Coalesce editor/atomic-replace notifications; never reload through unsaved edits. */
export class ExternalSync {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly canReload: () => boolean,
    private readonly reload: () => Promise<void>,
    private readonly report: (message: string) => void,
  ) {}
  changed(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.canReload())
        void this.reload().catch((error) =>
          this.report(`外部変更を自動反映できませんでした: ${String(error)}`),
        );
    }, 300);
  }
}
