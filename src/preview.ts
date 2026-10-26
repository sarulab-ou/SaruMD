import DOMPurify from 'dompurify';
import { safeHttpUrl } from './markdown';
import { boundedDebounce } from './scheduler';
import { waitForPrintImage } from './printing';

export function sanitizePreview(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'strong',
      'em',
      'del',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'img',
      'pre',
      'code',
      'input',
    ],
    ALLOWED_ATTR: [
      'href',
      'alt',
      'title',
      'type',
      'checked',
      'disabled',
      'start',
      'align',
      'data-winmd-src',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style', 'src', 'srcset', 'id', 'name'],
  }) as DocumentFragment;
}

const shell = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"><style>
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;padding:28px 34px 80px;color:#283344;font:15px/1.85 'Yu Gothic UI','Meiryo',sans-serif;overflow-wrap:anywhere}h1,h2,h3{line-height:1.5;color:#17253b}h1{font-size:28px;border-bottom:1px solid #e4e8ee;padding-bottom:12px;margin-top:0}h2{font-size:22px;border-bottom:1px solid #e4e8ee;padding-bottom:7px}h3{font-size:18px}a{color:#265fd6}pre{background:#f4f6fa;border:1px solid #e6eaf0;border-radius:6px;padding:16px;overflow:auto;line-height:1.6}code{font:13px/1.7 'Cascadia Code','BIZ UDGothic',Consolas,monospace;background:#f1f4f8;border-radius:3px;padding:2px 4px}pre code{padding:0;background:none}blockquote{margin-left:0;border-left:3px solid #bdcbe1;padding-left:18px;color:#627086}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #dce2eb;padding:7px 12px}th{background:#f4f6fa}img{max-width:100%;height:auto}hr{border:0;border-top:1px solid #dce2eb}input{pointer-events:none}.image-note{display:inline-block;font-size:12px;background:#f6f3e8;color:#786335;border:1px solid #e9dfc4;padding:6px 10px;border-radius:4px}
</style></head><body><article></article></body></html>`;

export class Preview {
  private readonly worker = new Worker(
    new URL('./preview-worker.ts', import.meta.url),
    { type: 'module' },
  );
  private text = '';
  private generation = 0;
  private requested = 0;
  private remote = false;
  private body!: HTMLElement;
  private printRequest?: {
    revision: number;
    resolve: () => void;
    reject: (error: Error) => void;
  };
  private readonly schedule = boundedDebounce(() => {
    if (this.printRequest) return;
    this.requested = this.generation;
    this.worker.postMessage({ revision: this.requested, text: this.text });
  });
  readonly ready: Promise<void>;
  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly image: (reference: string) => Promise<string>,
    private readonly link: (url: string) => Promise<void>,
    private readonly report: (message: string) => void,
  ) {
    this.ready = new Promise((resolve) => {
      frame.addEventListener(
        'load',
        () => {
          const doc = frame.contentDocument!;
          this.body = doc.querySelector('article')!;
          doc.addEventListener('click', (event) => {
            const target = event.target as Element;
            const anchor = target.closest('a');
            if (anchor) {
              event.preventDefault();
              const url = safeHttpUrl(anchor.getAttribute('href') ?? '');
              if (url && event.isTrusted)
                void this.link(url).catch((e) => this.report(String(e)));
            }
          });
          doc.addEventListener('submit', (event) => event.preventDefault());
          doc.addEventListener('auxclick', (event) => event.preventDefault());
          doc.addEventListener('contextmenu', (event) =>
            event.preventDefault(),
          );
          // iframe keyboard events do not bubble to the app's menu/shortcut handlers.
          doc.addEventListener('keydown', (event) => {
            if (event.isComposing || event.keyCode === 229) return;
            const key = event.key.toLowerCase();
            if (
              (event.ctrlKey &&
                !event.altKey &&
                ['n', 'o', 's', 'w', 'p'].includes(key)) ||
              (event.altKey && !event.ctrlKey && key === 'f')
            ) {
              event.preventDefault();
              document.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: event.key,
                  ctrlKey: event.ctrlKey,
                  altKey: event.altKey,
                  shiftKey: event.shiftKey,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            }
          });
          resolve();
        },
        { once: true },
      );
    });
    frame.srcdoc = shell; // Static shell only; document content never enters srcdoc.
    this.worker.onmessage = (
      event: MessageEvent<{ revision: number; html?: string; error?: string }>,
    ) => {
      if (event.data.revision !== this.requested) return;
      if (event.data.error) {
        this.report(event.data.error);
        this.printRequest?.reject(new Error(event.data.error));
        this.printRequest = undefined;
        return;
      }
      void this.paint(event.data.html ?? '', event.data.revision)
        .then(() => {
          if (this.printRequest?.revision === event.data.revision) {
            this.printRequest.resolve();
            this.printRequest = undefined;
          }
        })
        .catch((error: unknown) => {
          this.printRequest?.reject(new Error(String(error)));
          this.printRequest = undefined;
          this.report(String(error));
        });
    };
    this.worker.onerror = () => {
      this.printRequest?.reject(new Error('プレビュー変換に失敗しました。'));
      this.printRequest = undefined;
      this.report(
        'プレビュー変換でエラーが発生しました。編集内容は保持されています。',
      );
    };
  }
  update(text: string): void {
    this.text = text;
    this.generation++;
    this.schedule();
  }
  allowRemote(allowed: boolean): void {
    this.remote = allowed;
    this.update(this.text);
  }
  async preparePrint(text: string, target: HTMLElement): Promise<void> {
    await this.ready;
    this.text = text;
    this.requested = ++this.generation;
    await new Promise<void>((resolve, reject) => {
      this.printRequest = { revision: this.requested, resolve, reject };
      this.worker.postMessage({ revision: this.requested, text });
    });
    // Copy only the sanitized, resolved article. No Markdown HTML enters the app shell.
    target.replaceChildren(
      ...[...this.body.childNodes].map((node) => node.cloneNode(true)),
    );
    await Promise.all(
      [...target.querySelectorAll('img')].map(waitForPrintImage),
    );
    await document.fonts?.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }
  private async paint(html: string, generation: number): Promise<void> {
    await this.ready;
    if (generation !== this.requested) return;
    const fragment = sanitizePreview(html);
    fragment.querySelectorAll('a').forEach((a) => {
      const url = safeHttpUrl(a.getAttribute('href') ?? '');
      if (url) {
        a.setAttribute('href', url);
        a.setAttribute('rel', 'noreferrer noopener');
      } else a.removeAttribute('href');
    });
    fragment.querySelectorAll('input').forEach((input) => {
      input.type = 'checkbox';
      input.disabled = true;
    });
    const images = [...fragment.querySelectorAll('img')];
    // Insert the sanitized fragment without src first. All later changes use DOM properties.
    const scroll = this.frame.contentWindow!.scrollY;
    this.body.replaceChildren(fragment);
    this.frame.contentWindow!.scrollTo(0, scroll);
    for (let i = 0; i < images.length; i++) {
      if (generation !== this.requested) return;
      const img = images[i];
      const reference = img.getAttribute('data-winmd-src') ?? '';
      img.removeAttribute('data-winmd-src');
      const note = (message: string) => {
        const span = img.ownerDocument.createElement('span');
        span.className = 'image-note';
        span.textContent = `${img.alt || '画像'} — ${message}`;
        img.replaceWith(span);
      };
      if (i >= 100) {
        note('画像は先頭100件まで表示します');
        continue;
      }
      const remoteUrl = safeHttpUrl(reference);
      try {
        let source: string;
        if (remoteUrl) {
          if (!this.remote) {
            note('外部画像はブロック中');
            continue;
          }
          source = remoteUrl;
        } else {
          source = await this.image(reference);
        }
        if (generation !== this.requested) return;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => note('画像を表示できません'), {
          once: true,
        });
        img.src = source;
      } catch (error) {
        if (generation === this.requested) note(String(error));
      }
    }
  }
}
