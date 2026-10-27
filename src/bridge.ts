import { invoke } from '@tauri-apps/api/core';
import type { Snapshot } from './document';
import type { ClipboardContents } from './editing';

// No command accepts a caller-provided document/window ID or unrestricted file path.
export const bridge = {
  snapshot: () => invoke<Snapshot>('document_snapshot'),
  newDocument: () => invoke<void>('new_document'),
  open: () => invoke<void>('open_documents'),
  save: (text: string, revision: number, saveAs: boolean) =>
    invoke<Snapshot | null>('save_document', { text, revision, saveAs }),
  reload: (text: string, revision: number, onlyIfClean = false) =>
    invoke<Snapshot>('reload_document', { text, revision, onlyIfClean }),
  checkExternal: () => invoke<boolean>('check_external'),
  close: (text: string, revision: number, discard: boolean) =>
    invoke<void>('close_document', { text, revision, discard }),
  requestClose: () => invoke<void>('request_close'),
  requestExit: () => invoke<void>('request_exit'),
  print: () => invoke<void>('print_document'),
  exportPdf: () => invoke<string | null>('export_pdf'),
  image: (reference: string) =>
    invoke<string>('read_local_image', { reference }),
  link: (url: string) => invoke<void>('open_external_link', { url }),
  title: (dirty: boolean) => invoke<void>('set_document_title', { dirty }),
  pasteImage: (png: Uint8Array) => invoke<string>('save_pasted_image', png),
  writeClipboardText: (text: string) =>
    invoke<void>('write_clipboard_text', { text }),
  readClipboard: async (): Promise<ClipboardContents> => {
    const bytes = new Uint8Array(await invoke<ArrayBuffer>('read_clipboard'));
    if (bytes[0] === 1) return { type: 'image', png: bytes.subarray(1) };
    if (bytes[0] === 0)
      return {
        type: 'text',
        text: new TextDecoder().decode(bytes.subarray(1)),
      };
    throw new Error('クリップボードの応答が不正です。');
  },
};
