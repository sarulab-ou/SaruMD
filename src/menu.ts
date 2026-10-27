interface MenuEntry {
  trigger: HTMLButtonElement;
  menu: HTMLElement;
  key: string;
  onOpen?: () => void;
}

/** Windows-style access keys and keyboard navigation for the menu bar. */
export function setupMenus(entries: MenuEntry[], blocked: () => boolean) {
  let active: MenuEntry | undefined;
  const items = (entry: MenuEntry) =>
    [
      ...entry.menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].filter((item) => !item.disabled);
  const close = (restore = false) => {
    const previous = active;
    for (const entry of entries) {
      entry.menu.hidden = true;
      entry.trigger.setAttribute('aria-expanded', 'false');
    }
    active = undefined;
    if (restore) previous?.trigger.focus();
  };
  const open = (entry: MenuEntry, last = false) => {
    if (blocked()) return;
    close();
    entry.onOpen?.();
    active = entry;
    entry.menu.hidden = false;
    entry.trigger.setAttribute('aria-expanded', 'true');
    const enabled = items(entry);
    (last ? enabled.at(-1) : enabled[0])?.focus();
  };
  for (const entry of entries) {
    entry.trigger.addEventListener('click', () => {
      if (active === entry) close();
      else open(entry);
    });
    entry.trigger.addEventListener('pointerenter', () => {
      if (active && active !== entry) open(entry);
    });
    entry.trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        open(entry, event.key === 'ArrowUp');
      }
    });
    // Close before the command runs, so the command can focus the editor/search field.
    entry.menu.addEventListener(
      'click',
      (event) => {
        if ((event.target as Element).closest('[role="menuitem"]')) close(true);
      },
      { capture: true },
    );
  }
  const inside = (target: EventTarget | null) =>
    target instanceof Node &&
    entries.some((entry) => entry.trigger.parentElement!.contains(target));
  document.addEventListener('pointerdown', (event) => {
    if (!inside(event.target)) close();
  });
  document.addEventListener('focusin', (event) => {
    if (!inside(event.target)) close();
  });
  window.addEventListener('blur', () => close());
  document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229 || blocked()) return;
    const entry = entries.find(
      (entry) =>
        event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === entry.key,
    );
    if (entry) {
      event.preventDefault();
      if (active === entry) close(true);
      else open(entry);
    } else if (active && event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (active && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      open(
        entries[
          (entries.indexOf(active) +
            (event.key === 'ArrowRight' ? 1 : -1) +
            entries.length) %
            entries.length
        ],
      );
    } else if (
      active &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      const enabled = items(active);
      const current = enabled.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabled.length - 1
            : (current +
                (event.key === 'ArrowDown' ? 1 : -1) +
                enabled.length) %
              enabled.length;
      enabled[next]?.focus();
    } else if (active && event.key === 'Tab') close();
  });
  return { close, isOpen: () => active !== undefined };
}
