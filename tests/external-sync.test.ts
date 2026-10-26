import { afterEach, expect, it, vi } from 'vitest';
import { ExternalSync } from '../src/external-sync';

afterEach(() => vi.useRealTimers());

it('coalesces replacement/write events and automatically reloads a clean document', async () => {
  vi.useFakeTimers();
  const reload = vi.fn().mockResolvedValue(undefined);
  const sync = new ExternalSync(() => true, reload, vi.fn());
  sync.changed();
  vi.advanceTimersByTime(200);
  sync.changed();
  await vi.advanceTimersByTimeAsync(299);
  expect(reload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('does not discard typing or save activity that started after the external event', async () => {
  vi.useFakeTimers();
  let dirty = false;
  let busy = false;
  const reload = vi.fn().mockResolvedValue(undefined);
  const sync = new ExternalSync(() => !dirty && !busy, reload, vi.fn());
  sync.changed();
  dirty = true;
  await vi.advanceTimersByTimeAsync(300);
  expect(reload).not.toHaveBeenCalled();
  dirty = false;
  busy = true;
  sync.changed();
  await vi.advanceTimersByTimeAsync(300);
  expect(reload).not.toHaveBeenCalled();
  busy = false;
  sync.changed();
  await vi.advanceTimersByTimeAsync(300);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('reports an inaccessible/deleted file and allows retry after it reappears', async () => {
  vi.useFakeTimers();
  const report = vi.fn();
  const reload = vi
    .fn()
    .mockRejectedValueOnce(new Error('missing'))
    .mockResolvedValue(undefined);
  const sync = new ExternalSync(() => true, reload, report);
  sync.changed();
  await vi.advanceTimersByTimeAsync(300);
  expect(report).toHaveBeenCalledWith(expect.stringContaining('missing'));
  sync.changed();
  await vi.advanceTimersByTimeAsync(300);
  expect(reload).toHaveBeenCalledTimes(2);
});
