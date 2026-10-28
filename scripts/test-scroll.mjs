import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const browser =
  process.env.WINMD_BROWSER ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(browser))
  throw new Error(
    'Set WINMD_BROWSER to an installed Chromium/Edge executable.',
  );
fs.mkdirSync('.tools', { recursive: true });
const profile = fs.mkdtempSync(path.resolve('.tools/scroll-browser-'));
let complete;
const result = new Promise((resolve) => {
  complete = resolve;
});
const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 0, watch: null },
  plugins: [
    {
      name: 'scroll-test-result',
      configureServer(server) {
        server.middlewares.use('/__scroll_probe_result', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          let body = '';
          req.setEncoding('utf8');
          req.on('data', (data) => {
            body += data;
            if (body.length > 65536) req.destroy();
          });
          req.on('end', () => {
            try {
              complete(JSON.parse(body));
              res.end('OK');
            } catch {
              res.statusCode = 400;
              res.end();
            }
          });
        });
      },
    },
  ],
});
await server.listen();
const port = server.httpServer.address().port;
const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    `http://127.0.0.1:${port}/tests/browser/scroll-sync.html`,
  ],
  { windowsHide: true },
);
let errors = '';
child.stderr.on('data', (data) => {
  errors = (errors + data).slice(-65536);
});
child.on('error', (error) =>
  complete({ status: 'FAIL', error: String(error) }),
);
const timer = setTimeout(
  () => complete({ status: 'FAIL', error: 'Browser test timed out' }),
  30000,
);
try {
  const value = await result;
  const { printHtml, ...report } = value;
  if (typeof printHtml === 'string')
    fs.writeFileSync('.tools/math-print.html', printHtml);
  fs.writeFileSync(
    '.tools/scroll-smoke-result.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
  if (value.status !== 'PASS') process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child.kill();
  await server.close();
  fs.writeFileSync('.tools/scroll-smoke-browser.log', errors);
}
