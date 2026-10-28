import DOMPurify from 'dompurify';

const origins = new WeakMap<Element, { from: number; raw: string }>();
const mathTags = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'mspace',
  'ms',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mlabeledtr',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
  'mmultiscripts',
  'mprescripts',
  'none',
];
const safeTags = new Set([...mathTags, 'span']);

export const mathStyles = `
math{font-family:'Cambria Math','STIX Two Math',math;font-size:1.12em}
.winmd-math-inline{display:inline}
.winmd-math-block{display:block;overflow-x:auto;overflow-y:hidden;margin:1em 0;padding:4px 0;break-inside:avoid}
.winmd-math-block math{margin:0 auto}
.winmd-math-error{color:#b42d30;white-space:pre-wrap;font-family:Consolas,monospace}
`;

/** MathML is sanitized separately; Markdown never gains CSS, SVG, or MathML permissions. */
export function hydrateMath(root: ParentNode): void {
  for (const element of root.querySelectorAll('span[data-winmd-math]')) {
    const raw = element.textContent ?? '';
    const from = element.getAttribute('data-winmd-from') ?? '';
    const block = element.getAttribute('data-winmd-display') === 'block';
    let markup = element.getAttribute('data-winmd-math') ?? '';
    // Reject fetching/active markup before handing even a detached tree to a DOM parser.
    if (
      [...markup.matchAll(/<\/?([a-z][\w:.-]*)\b/gi)].some(
        (tag) => !safeTags.has(tag[1].toLowerCase()),
      ) ||
      /<[^>]*\s(?:href|xlink:href|src|style|on\w+)\s*=/i.test(markup)
    )
      markup = '';
    element.removeAttribute('data-winmd-from');
    element.removeAttribute('data-winmd-display');
    element.removeAttribute('data-winmd-math');
    element.className = block ? 'winmd-math-block' : 'winmd-math-inline';
    if (/^\d+$/.test(from) && Number.isSafeInteger(Number(from)))
      origins.set(element, { from: Number(from), raw });
    const fragment = DOMPurify.sanitize(markup, {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: mathTags,
      ALLOWED_ATTR: [
        'xmlns',
        'display',
        'encoding',
        'displaystyle',
        'scriptlevel',
        'mathvariant',
        'mathsize',
        'mathcolor',
        'mathbackground',
        'stretchy',
        'symmetric',
        'fence',
        'separator',
        'lspace',
        'rspace',
        'columnalign',
        'columnspacing',
        'rowalign',
        'rowspacing',
        'columnlines',
        'rowlines',
        'frame',
        'framespacing',
        'equalcolumns',
        'equalrows',
        'width',
        'height',
        'depth',
        'voffset',
        'linethickness',
        'accent',
        'accentunder',
        'maxsize',
        'minsize',
        'movablelimits',
        'form',
        'notation',
        'side',
      ],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: [
        'annotation-xml',
        'mglyph',
        'script',
        'style',
        'svg',
        'image',
        'img',
        'a',
      ],
      FORBID_ATTR: ['href', 'src', 'style', 'id', 'name'],
    }) as DocumentFragment;
    if (fragment.querySelector('math')) element.replaceChildren(fragment);
    else {
      element.textContent = raw;
      element.classList.add('winmd-math-error');
      element.setAttribute(
        'title',
        '数式を表示できません。構文・対応コマンド・数式の上限を確認してください。',
      );
    }
  }
}

export function mathOrigin(
  node: Node,
): { from: number; raw: string } | undefined {
  for (
    let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    element;
    element = element.parentElement
  ) {
    const origin = origins.get(element);
    if (origin) return origin;
  }
}
