/** File menu with Windows access key and roving keyboard focus. */
export function setupFileMenu(
  trigger: HTMLButtonElement,
  menu: HTMLElement,
  blocked: () => boolean,
): void {
  const items = () =>
    [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter(
      (item) => !item.disabled,
    );
  const close = (restore = false) => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restore) trigger.focus();
  };
  const open = (last = false) => {
    if (blocked()) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const enabled = items();
    (last ? enabled.at(-1) : enabled[0])?.focus();
  };
  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open(event.key === 'ArrowUp');
    }
  });
  menu.addEventListener('click', (event) => {
    if ((event.target as Element).closest('[role="menuitem"]')) close(true);
  });
  document.addEventListener('pointerdown', (event) => {
    if (
      !(event.target instanceof Node) ||
      !trigger.parentElement!.contains(event.target)
    )
      close();
  });
  document.addEventListener('focusin', (event) => {
    if (!trigger.parentElement!.contains(event.target as Node)) close();
  });
  window.addEventListener('blur', () => close());
  document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229 || blocked()) return;
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'f'
    ) {
      event.preventDefault();
      if (menu.hidden) open();
      else close(true);
    } else if (!menu.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (
      !menu.hidden &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      const enabled = items();
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
    } else if (!menu.hidden && event.key === 'Tab') close();
  });
}
