import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import {
  httpLinkPattern,
  httpLinks,
  isLinkClick,
  safeHttpUrl,
  safeLinkReference,
  type LinkPointer,
} from './links';

export interface EditorLinks {
  open: (url: string) => Promise<void>;
  report: (message: string) => void;
  hover?: (reference: string | null, pointer?: LinkPointer) => void;
}

export function editorLinks(options: EditorLinks): Extension {
  const referenceAt = (target: EventTarget | null, view: EditorView) => {
    const element = target as Element | null;
    const link =
      element?.closest<HTMLElement>('.cm-file-link') ??
      element?.closest<HTMLElement>('.cm-http-link');
    return link && view.contentDOM.contains(link)
      ? safeLinkReference(
          link.dataset.linkReference ?? link.dataset.httpUrl ?? '',
        )
      : null;
  };
  const localMarks = (view: EditorView) => {
    const marks: Range<Decoration>[] = [];
    const tree = syntaxTree(view.state);
    // Parse Markdown destinations rather than guessing with a regular expression.
    for (const range of view.visibleRanges) {
      tree.iterate({
        from: range.from,
        to: range.to,
        enter(node) {
          if (node.name !== 'Link') return;
          const destination = node.node.getChild('URL');
          if (!destination) return;
          let raw = view.state.sliceDoc(destination.from, destination.to);
          if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1);
          raw = raw.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
          const reference = safeLinkReference(raw);
          if (reference && !safeHttpUrl(reference))
            marks.push(
              Decoration.mark({
                class: 'cm-file-link',
                attributes: {
                  'data-link-reference': reference,
                },
              }).range(node.from, node.to),
            );
          return false;
        },
      });
    }
    return marks;
  };
  const matcher = new MatchDecorator({
    regexp: new RegExp(httpLinkPattern),
    decorate(add, from, _to, match) {
      const link = httpLinks(match[0])[0];
      if (link)
        add(
          from,
          from + link.to,
          Decoration.mark({
            class: 'cm-http-link',
            attributes: {
              'data-http-url': link.url,
            },
          }),
        );
    },
  });
  return [
    ViewPlugin.fromClass(
      class {
        web;
        decorations;
        constructor(view: EditorView) {
          this.web = matcher.createDeco(view);
          this.decorations = this.web.update({
            add: localMarks(view),
            sort: true,
          });
        }
        update(update: import('@codemirror/view').ViewUpdate) {
          if (update.docChanged || update.viewportChanged)
            options.hover?.(null);
          this.web = matcher.updateDeco(update, this.web);
          this.decorations = this.web.update({
            add: localMarks(update.view),
            sort: true,
          });
        }
        destroy() {
          options.hover?.(null);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      mousemove(event, view) {
        options.hover?.(
          event.buttons ? null : referenceAt(event.target, view),
          { x: event.clientX, y: event.clientY },
        );
        return false;
      },
      mousedown() {
        options.hover?.(null);
        return false;
      },
      mouseleave() {
        options.hover?.(null);
        return false;
      },
      click(event, view) {
        if (
          view.composing ||
          !isLinkClick(
            event,
            view.state.selection.ranges.some((range) => !range.empty),
          )
        )
          return false;
        const url = referenceAt(event.target, view);
        if (!url) return false;
        event.preventDefault();
        void options.open(url).catch((error) => options.report(String(error)));
        return true;
      },
    }),
  ];
}
