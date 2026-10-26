import { afterEach, expect, it, vi } from 'vitest';
import { Preview } from '../src/preview';

class WorkerStub {
  static current: WorkerStub;
  onmessage!: (event: MessageEvent) => void;
  onerror: unknown;
  sent: { revision: number; text: string }[] = [];
  constructor() {
    WorkerStub.current = this;
  }
  postMessage(message: { revision: number; text: string }) {
    this.sent.push(message);
  }
  reply(revision: number, html: string) {
    this.onmessage(new MessageEvent('message', { data: { revision, html } }));
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

async function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', WorkerStub);
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  document.body.append(frame);
  vi.spyOn(frame.contentWindow!, 'scrollTo').mockImplementation(
    () => undefined,
  );
  const image = vi.fn().mockResolvedValue('data:image/png;base64,eA==');
  const preview = new Preview(frame, image, vi.fn(), vi.fn());
  // jsdom doesn't navigate srcdoc; initialize its static article and signal load.
  frame.contentDocument!.body.innerHTML = '<article></article>';
  frame.dispatchEvent(new Event('load'));
  await preview.ready;
  return { frame, image, preview, worker: WorkerStub.current };
}

it('accepts a bounded snapshot during continuous input, then refuses older results', async () => {
  const { frame, preview, worker } = await setup();
  preview.update('first');
  vi.advanceTimersByTime(200);
  const first = worker.sent[0].revision;
  preview.update('still typing');
  worker.reply(first, '<p>first</p>');
  await Promise.resolve();
  await Promise.resolve();
  expect(frame.contentDocument!.querySelector('article')!.textContent).toBe(
    'first',
  );
  vi.advanceTimersByTime(200);
  const latest = worker.sent[1].revision;
  worker.reply(latest, '<p>latest</p>');
  await Promise.resolve();
  await Promise.resolve();
  worker.reply(first, '<p>stale</p>');
  await Promise.resolve();
  expect(frame.contentDocument!.querySelector('article')!.textContent).toBe(
    'latest',
  );
});

it('blocks external image loading by default and never gives links script URLs', async () => {
  const { frame, image, preview, worker } = await setup();
  preview.update('image');
  vi.advanceTimersByTime(200);
  worker.reply(
    worker.sent[0].revision,
    '<img data-winmd-src="https://example.invalid/pixel"><a href="javascript:alert(1)">link</a>',
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(frame.contentDocument!.querySelector('img')).toBeNull();
  expect(
    frame.contentDocument!.querySelector('article')!.textContent,
  ).toContain('ブロック中');
  expect(image).not.toHaveBeenCalled();
  expect(frame.contentDocument!.querySelector('a')!.hasAttribute('href')).toBe(
    false,
  );
});

it('prints the latest unsaved text and keeps raw HTML and blocked images safe', async () => {
  const { preview, worker } = await setup();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  const target = document.createElement('article');
  document.body.append(target);
  preview.update('old');
  vi.advanceTimersByTime(200);
  const old = worker.sent[0].revision;
  const pending = preview.preparePrint('unsaved 最新', target);
  await Promise.resolve();
  const latest = worker.sent.at(-1)!;
  expect(latest.text).toBe('unsaved 最新');
  worker.reply(old, '<p>old</p>');
  worker.reply(
    latest.revision,
    '<h1>unsaved 最新</h1><script>bad()</script><img data-winmd-src="https://tracking.invalid/x"><input type="checkbox" checked>',
  );
  await pending;
  expect(target.querySelector('h1')?.textContent).toBe('unsaved 最新');
  expect(target.querySelector('script,img')).toBeNull();
  expect(target.textContent).toContain('ブロック中');
  expect(target.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
});
