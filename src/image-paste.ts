import {
  EditorSelection,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const supported = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export interface PasteTarget {
  valid(): boolean;
  insert(filename: string): void;
}
export interface ImagePasteOptions {
  // Invoked immediately, so the caller can reserve its save queue before decoding starts.
  persist(
    readPng: () => Promise<Uint8Array>,
    target: PasteTarget,
  ): Promise<void>;
  report(message: string): void;
}

export async function clipboardPng(file: File): Promise<Uint8Array> {
  if (!supported.has(file.type))
    throw new Error('この画像形式は貼り付けできません。');
  if (file.size > MAX_BYTES)
    throw new Error('貼り付け画像の上限は16 MiBです。');
  if (file.type === 'image/png')
    return new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS)
      throw new Error('貼り付け画像の上限は16メガピクセルです。');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像をPNGに変換できません。');
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('PNG変換に失敗しました。')),
        'image/png',
      ),
    );
    if (png.size > MAX_BYTES)
      throw new Error('PNGに変換した画像が16 MiBを超えています。');
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

interface Pending {
  from: number;
  to: number;
  valid: boolean;
}
const add = StateEffect.define<{ token: object; range: Pending }>();
const remove = StateEffect.define<object>();
const positions = StateField.define<Map<object, Pending>>({
  create: () => new Map(),
  update(previous, transaction) {
    const next = new Map<object, Pending>();
    for (const [token, range] of previous) {
      // Never replace text that the user edited while an image was being written.
      const touched =
        range.from !== range.to &&
        transaction.changes.touchesRange(range.from, range.to);
      next.set(token, {
        from: transaction.changes.mapPos(range.from, 1),
        to: transaction.changes.mapPos(range.to, 1),
        valid: range.valid && !touched,
      });
    }
    for (const effect of transaction.effects) {
      if (effect.is(add)) next.set(effect.value.token, effect.value.range);
      if (effect.is(remove)) next.delete(effect.value);
    }
    return next;
  },
});

export function imagePaste(options: ImagePasteOptions): Extension {
  return [
    positions,
    EditorView.domEventHandlers({
      paste(event, view) {
        if (view.composing || view.state.readOnly) return false;
        const items = Array.from(event.clipboardData?.items ?? []);
        const item = items.find(
          (item) => item.kind === 'file' && item.type.startsWith('image/'),
        );
        if (!item) return false; // Ordinary text paste remains CodeMirror's responsibility.
        const file = item.getAsFile();
        if (!file) return false;
        event.preventDefault();
        if (!supported.has(file.type)) {
          options.report('貼り付け画像はPNG/JPEG/GIF/WebPに対応しています。');
          return true;
        }
        const token = {};
        const selection = view.state.selection.main;
        view.dispatch({
          effects: add.of({
            token,
            range: { from: selection.from, to: selection.to, valid: true },
          }),
        });
        const range = () => view.state.field(positions, false)?.get(token);
        const target: PasteTarget = {
          valid: () => range()?.valid === true && !view.state.readOnly,
          insert(filename) {
            if (!/^\d{8}_\d{6}\.png$/.test(filename))
              throw new Error('画像のファイル名が不正です。');
            const current = range();
            if (!current?.valid || view.state.readOnly)
              throw new Error(
                '貼り付け位置が変更されたため挿入を中止しました。保存したPNGは文書フォルダーに残っています。',
              );
            const markdown = `![画像](${filename})`;
            view.dispatch({
              changes: { from: current.from, to: current.to, insert: markdown },
              effects: remove.of(token),
              selection: EditorSelection.cursor(current.from + markdown.length),
              annotations: [
                Transaction.userEvent.of('input.paste'),
                isolateHistory.of('full'),
              ],
            });
          },
        };
        void options
          .persist(() => clipboardPng(file), target)
          .catch((error) =>
            options.report(`画像を貼り付けできませんでした: ${String(error)}`),
          )
          .finally(() => {
            if (range()) view.dispatch({ effects: remove.of(token) });
          });
        return true;
      },
    }),
  ];
}
