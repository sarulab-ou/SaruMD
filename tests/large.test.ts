import { it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { mappedMarkdownHtml } from '../src/markdown';
import { sanitizePreview } from '../src/preview';

it('processes a reproducible 10,000-line document without truncation', () => {
  const text = Array.from(
    { length: 10000 },
    (_, i) => `- 行 ${i + 1} **日本語** \`code\``,
  ).join('\n');
  const start = performance.now();
  let state = EditorState.create({ doc: text });
  for (let i = 0; i < 100; i++)
    state = state.update({
      changes: { from: state.doc.length, insert: '追' },
    }).state;
  const editTime = performance.now();
  const html = mappedMarkdownHtml(state.doc.toString());
  const parseTime = performance.now();
  const fragment = sanitizePreview(html);
  const sanitizeTime = performance.now();
  expect(fragment.querySelectorAll('li').length).toBe(10000);
  expect(fragment.textContent).toContain('行 10000');
  console.log(
    JSON.stringify({
      lines: 10000,
      editorState100EditsMs: Math.round(editTime - start),
      markedMs: Math.round(parseTime - editTime),
      jsdomSanitizeMs: Math.round(sanitizeTime - parseTime),
    }),
  );
}, 15000);
