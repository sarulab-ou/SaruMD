export function setupSplit(): void {
  const split = document.querySelector<HTMLElement>('#split')!;
  const divider = document.querySelector<HTMLElement>('#divider')!;
  let ratio = 50;
  const set = (value: number) => {
    ratio = Math.max(20, Math.min(80, value));
    split.style.setProperty('--source-width', `${ratio}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  };
  divider.onpointerdown = (event) => {
    divider.setPointerCapture(event.pointerId);
    split.classList.add('resizing');
  };
  divider.onpointermove = (event) => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    const bounds = split.getBoundingClientRect();
    set(((event.clientX - bounds.left) / bounds.width) * 100);
  };
  divider.onpointerup = (event) => {
    divider.releasePointerCapture(event.pointerId);
    split.classList.remove('resizing');
  };
  divider.onlostpointercapture = () => split.classList.remove('resizing');
  divider.onkeydown = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      set(ratio + (event.key === 'ArrowLeft' ? -2 : 2));
    }
  };
}
