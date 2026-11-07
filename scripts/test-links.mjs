import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser =
  process.env.WINMD_BROWSER ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(browser))
  throw new Error(
    'Set WINMD_BROWSER to an installed Chromium/Edge executable.',
  );
fs.mkdirSync('.tools', { recursive: true });
const profile = fs.mkdtempSync(path.resolve('.tools/link-browser-'));
const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 0, watch: null },
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/tests/browser/links.html`;
const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--window-size=1280,900',
    'about:blank',
  ],
  { windowsHide: true },
);
let socket,
  sequence = 0;
const pending = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wait = async (task) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    const value = await task();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Browser probe timed out');
};
try {
  const active = path.join(profile, 'DevToolsActivePort');
  await wait(() => fs.existsSync(active));
  const port = fs.readFileSync(active, 'utf8').split('\n')[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(
    pages.find((page) => page.type === 'page').webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    clearTimeout(task.timer);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.navigate', { url });
  await wait(() => evaluate('!!window.linksProbe'));
  const point = (pane, part) =>
    evaluate(
      `window.linksProbe.point(${JSON.stringify(pane)},${JSON.stringify(part)})`,
    );
  const click = async (pane, part) => {
    await evaluate('window.linksProbe.clear()');
    const p = await point(pane, part);
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...p,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...p,
      button: 'left',
      clickCount: 1,
    });
    await delay(150);
  };
  await evaluate('window.linksProbe.synthetic()');
  assert.equal((await evaluate('window.linksProbe.result()')).opens.length, 0);
  await click('source', 'source');
  await click('preview', 'preview');
  await click('preview', 'code');
  let result = await evaluate('window.linksProbe.result()');
  assert.deepEqual(result.opens, [
    { pane: 'source', url: 'https://example.com/source' },
    { pane: 'preview', url: 'https://example.org/preview' },
    { pane: 'preview', url: 'https://example.net/code' },
  ]);
  for (const pane of ['source', 'preview']) {
    await evaluate('window.linksProbe.clear()');
    const p = await point(pane, pane === 'source' ? 'source' : 'preview');
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...p,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x + 55,
      y: p.y,
      buttons: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: p.x + 55,
      y: p.y,
      button: 'left',
      clickCount: 1,
    });
    await delay(150);
  }
  assert.equal((await evaluate('window.linksProbe.result()')).opens.length, 3);
  await evaluate('window.linksProbe.readonly()');
  await click('source', 'source');
  result = await evaluate('window.linksProbe.result()');
  assert.equal(result.opens.length, 4);
  assert(result.unchanged);
  assert(!result.canUndo);
  assert.deepEqual(result.errors, []);
  const report = {
    status: 'PASS',
    trustedClicks: result.opens,
    syntheticIgnored: true,
    dragSelectionPreserved: true,
    readonlySource: true,
    documentUnchanged: result.unchanged,
    previewHref: result.previewHref,
  };
  fs.writeFileSync(
    '.tools/links-smoke-result.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const task of pending.values()) clearTimeout(task.timer);
  socket?.close();
  child.kill();
  await server.close();
}
