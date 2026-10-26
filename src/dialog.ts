export function confirmDialog(
  title: string,
  message: string,
  choices: { value: string; label: string }[],
): Promise<string> {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm')!;
  dialog.querySelector('h2')!.textContent = title;
  dialog.querySelector('p')!.textContent = message;
  const actions = dialog.querySelector('.dialog-actions')!;
  actions.replaceChildren(
    ...choices.map((choice) => {
      const button = document.createElement('button');
      button.value = choice.value;
      button.textContent = choice.label;
      return button;
    }),
  );
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue || 'cancel'),
      { once: true },
    );
    dialog.showModal();
  });
}
