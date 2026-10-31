import DOMPurify from 'dompurify';
import { safeHttpUrl } from './links';
import { hydrateMath, mathStyles } from './math-preview';
import { boundedDebounce } from './scheduler';
import { waitForPrintImage } from './printing';
import { previewScrollPane, type PreviewBlock } from './scroll-sync';
import { PreviewLocations } from './preview-location';

export function sanitizePreview(html: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(html, {
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
      'span',
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
      'data-winmd-line',
      'data-winmd-math',
      'data-winmd-from',
      'data-winmd-display',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style', 'src', 'srcset', 'id', 'name'],
  }) as DocumentFragment;
  hydrateMath(fragment);
  return fragment;
}

const shell = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"><style>
html{overflow-anchor:none;scroll-behavior:auto}
${mathStyles}
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
  private requestedText = '';
  private blocks: PreviewBlock[] = [];
  private blockLines: number[] = [];
  private lines = 1;
  renderedText: string | null = null;
  layoutChanged?: () => void;
  navigateToSource?: (offset: number) => void;
  private locations?: PreviewLocations;
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
    this.requestedText = this.text;
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
          if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => this.layoutChanged?.());
            observer.observe(this.body);
            window.addEventListener('unload', () => observer.disconnect(), {
              once: true,
            });
          }
          doc.addEventListener('click', (event) => {
            const node = event.target as Node | null;
            const target =
              node?.nodeType === 1 ? (node as Element) : node?.parentElement;
            if (!target || !this.body.contains(target)) return;
            const anchor = target.closest('a');
            if (anchor) {
              event.preventDefault();
              const url = safeHttpUrl(anchor.getAttribute('href') ?? '');
              if (url && event.isTrusted)
                void this.link(url).catch((e) => this.report(String(e)));
              return;
            }
            if (
              event.button !== 0 ||
              event.detail > 1 ||
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.shiftKey ||
              !this.locations ||
              this.renderedText !== this.text ||
              doc.getSelection()?.isCollapsed === false
            )
              return;
            const caret = doc.caretPositionFromPoint?.(
              event.clientX,
              event.clientY,
            );
            const range = caret
              ? null
              : doc.caretRangeFromPoint?.(event.clientX, event.clientY);
            const caretNode = caret?.offsetNode ?? range?.startContainer;
            const offset = caret?.offset ?? range?.startOffset ?? 0;
            const position =
              caretNode && target.contains(caretNode)
                ? this.locations.offsetAt(caretNode, offset)
                : this.locations.offsetAt(target);
            if (position !== null) this.navigateToSource?.(position);
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
                ['n', 'o', 's', 'w', 'p', 'f', 'h', 'z', 'x', 'v'].includes(
                  key,
                )) ||
              (event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                ['f', 'e', 'd'].includes(key)) ||
              (!event.ctrlKey &&
                !event.altKey &&
                ['F3', 'F5'].includes(event.key))
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
      void this.paint(
        event.data.html ?? '',
        event.data.revision,
        this.requestedText,
      )
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
  scrollPane() {
    return previewScrollPane(
      this.frame,
      () => this.blocks,
      () => this.lines,
    );
  }
  get sourceLines(): readonly number[] {
    return this.blockLines;
  }
  allowRemote(allowed: boolean): void {
    this.remote = allowed;
    this.update(this.text);
  }
  async preparePrint(text: string, target: HTMLElement): Promise<void> {
    await this.ready;
    this.text = text;
    this.requested = ++this.generation;
    this.requestedText = text;
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
  private async paint(
    html: string,
    generation: number,
    source: string,
  ): Promise<void> {
    await this.ready;
    if (generation !== this.requested) return;
    const fragment = sanitizePreview(html);
    const locations = new PreviewLocations(source, fragment);
    this.lines = locations.lineCount;
    const blocks = locations.blocks;
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
    this.blocks = blocks;
    this.locations = locations;
    this.blockLines = blocks.map((block) => block.line);
    this.renderedText = source;
    this.frame.contentWindow!.scrollTo(0, scroll);
    this.layoutChanged?.();
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
        img.addEventListener('load', () => this.layoutChanged?.(), {
          once: true,
        });
        img.src = source;
      } catch (error) {
        if (generation === this.requested) note(String(error));
      }
    }
  }
}
