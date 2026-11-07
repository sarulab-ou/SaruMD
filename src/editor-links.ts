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
} from './links';

export interface EditorLinks {
  open: (url: string) => Promise<void>;
  report: (message: string) => void;
}

export function editorLinks(options: EditorLinks): Extension {
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
                  title: 'クリックしてリンク先のファイルを開く',
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
              title: 'クリックして既定のブラウザで開く',
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
          this.web = matcher.updateDeco(update, this.web);
          this.decorations = this.web.update({
            add: localMarks(update.view),
            sort: true,
          });
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      click(event, view) {
        if (
          view.composing ||
          !isLinkClick(
            event,
            view.state.selection.ranges.some((range) => !range.empty),
          )
        )
          return false;
        const element = event.target as Element | null;
        const target =
          element?.closest<HTMLElement>('.cm-file-link') ??
          element?.closest<HTMLElement>('.cm-http-link');
        if (!target || !view.contentDOM.contains(target)) return false;
        const url = safeLinkReference(
          target.dataset.linkReference ?? target.dataset.httpUrl ?? '',
        );
        if (!url) return false;
        event.preventDefault();
        void options.open(url).catch((error) => options.report(String(error)));
        return true;
      },
    }),
  ];
}
