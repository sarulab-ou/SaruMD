import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForPrintImage } from '../src/printing';

describe('print image readiness', () => {
  afterEach(() => vi.useRealTimers());
  it('waits for an image to load, including cached images', async () => {
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', {
      value: false,
      configurable: true,
    });
    Object.defineProperty(image, 'naturalWidth', { value: 300 });
    let done = false;
    const pending = waitForPrintImage(image).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    image.dispatchEvent(new Event('load'));
    await pending;
    Object.defineProperty(image, 'complete', { value: true });
    await expect(waitForPrintImage(image)).resolves.toBeUndefined();
  });
  it('rejects broken or stalled images instead of exporting incomplete content', async () => {
    const image = document.createElement('img');
    await expect(waitForPrintImage(image)).rejects.toThrow('読み込めません');
    Object.defineProperty(image, 'complete', { value: false });
    const failed = waitForPrintImage(image);
    image.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('読み込めません');
    vi.useFakeTimers();
    const stalled = expect(waitForPrintImage(image)).rejects.toThrow(
      'タイムアウト',
    );
    await vi.advanceTimersByTimeAsync(15000);
    await stalled;
    expect(vi.getTimerCount()).toBe(0);
  });
});
