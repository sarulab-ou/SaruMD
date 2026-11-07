import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { httpLinkPattern, httpLinks, isLinkClick, safeHttpUrl } from './links';

export interface EditorLinks {
  open: (url: string) => Promise<void>;
  report: (message: string) => void;
}

export function editorLinks(options: EditorLinks): Extension {
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
        decorations;
        constructor(view: EditorView) {
          this.decorations = matcher.createDeco(view);
        }
        update(update: import('@codemirror/view').ViewUpdate) {
          this.decorations = matcher.updateDeco(update, this.decorations);
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
        const target = (event.target as Element | null)?.closest<HTMLElement>(
          '.cm-http-link',
        );
        if (!target || !view.contentDOM.contains(target)) return false;
        const url = safeHttpUrl(target.dataset.httpUrl ?? '');
        if (!url) return false;
        event.preventDefault();
        void options.open(url).catch((error) => options.report(String(error)));
        return true;
      },
    }),
  ];
}
