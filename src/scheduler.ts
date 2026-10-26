/** Trailing debounce with a maximum wait while typing continuously. */
export function boundedDebounce(task: () => void, delay = 200, maxWait = 800) {
  let trailing: ReturnType<typeof setTimeout> | undefined;
  let maximum: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(trailing);
    clearTimeout(maximum);
    trailing = maximum = undefined;
    task();
  };
  return () => {
    clearTimeout(trailing);
    trailing = setTimeout(flush, delay);
    maximum ??= setTimeout(flush, maxWait);
  };
}
