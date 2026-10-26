import './style.css';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { bridge } from './bridge';
import { DocumentState, SerialTasks } from './document';
import { MarkdownEditor } from './editor';
import { Preview } from './preview';
import { confirmDialog } from './dialog';
import { setupSplit } from './split';
import type { PasteTarget } from './image-paste';
import { ExternalSync } from './external-sync';

const state = new DocumentState();
const saves = new SerialTasks();
const operations = new SerialTasks();
const status = document.querySelector<HTMLElement>('#status')!;
let editor: MarkdownEditor;
let ready = false;
let saving = false;
let exclusive = false;
const report = (message: string) => {
  status.textContent = message;
  status.classList.add('error');
};
const guard = (task: () => Promise<unknown>) => {
  void task().catch((error) => report(String(error)));
};
const preview = new Preview(
  document.querySelector('#preview')!,
  bridge.image,
  bridge.link,
  report,
);
const canAutoReload = () =>
  ready &&
  !state.dirty &&
  !saving &&
  !exclusive &&
  !editor.view.composing &&
  !document.querySelector<HTMLDialogElement>('#confirm')!.open;
const externalSync = new ExternalSync(
  canAutoReload,
  () =>
    operations.run(async () => {
      // Share the save/paste queue. Check again AFTER waiting so typing is never discarded.
      await saves.run(async () => {
        if (!canAutoReload()) return;
        const changed = await bridge.checkExternal();
        if (!changed || !canAutoReload()) return;
        exclusive = true;
        editor.setReadOnly(true);
        try {
          state.load(await bridge.reload(state.text, state.revision, true));
          editor.reload(state.text, state.readOnly, onEdit, true);
          status.classList.remove('error');
          refresh();
          preview.update(state.text);
          document.querySelector<HTMLElement>('#notice')!.hidden = true;
          status.textContent = '外部の変更を反映しました';
        } finally {
          exclusive = false;
          editor.setReadOnly(state.readOnly);
        }
      });
    }),
  report,
);

function refresh(): void {
  document.querySelector('#path')!.textContent =
    state.path ?? '新規文書 — 保存先は未指定';
  document
    .querySelector('#path')!
    .setAttribute('title', state.path ?? '新規文書');
  document.querySelector('#format')!.textContent =
    `UTF-8${state.format.bom ? ' BOM' : ''} · ${state.format.lineEnding === 'Mixed' ? '改行混在・読み取り専用' : state.format.lineEnding}`;
  if (!status.classList.contains('error'))
    status.textContent = saving
      ? '保存中…'
      : state.readOnly
        ? '読み取り専用：改行形式が混在しています'
        : state.dirty
          ? '未保存の変更'
          : '保存済み';
  document.querySelector<HTMLButtonElement>('#save')!.disabled = state.readOnly;
  document.querySelector<HTMLButtonElement>('#save-as')!.disabled =
    state.readOnly;
  guard(() => bridge.title(state.dirty));
}

function onEdit(text: string): void {
  state.edit(text);
  status.classList.remove('error');
  refresh();
  preview.update(text);
  if (!state.dirty) guard(checkExternal);
}

function save(saveAs = false): Promise<boolean> {
  return saves.run(() => saveNow(saveAs));
}

async function saveNow(saveAs = false): Promise<boolean> {
  if (state.readOnly || exclusive) return false;
  saving = true;
  status.classList.remove('error');
  refresh();
  const text = state.text,
    revision = state.revision;
  try {
    const snapshot = await bridge.save(text, revision, saveAs);
    if (!snapshot) return false;
    state.acknowledge(snapshot);
    preview.update(state.text);
    document.querySelector<HTMLElement>('#notice')!.hidden = true;
    return !state.dirty;
  } catch (error) {
    report(`保存できませんでした: ${String(error)}`);
    return false;
  } finally {
    saving = false;
    refresh();
    guard(checkExternal);
  }
}

function pasteImage(
  readPng: () => Promise<Uint8Array>,
  target: PasteTarget,
): Promise<void> {
  return saves.run(async () => {
    if (exclusive || state.readOnly || !target.valid()) return;
    const png = await readPng();
    if (!target.valid()) return;
    if (!state.path && !(await saveNow())) return;
    if (!target.valid()) return;
    status.classList.remove('error');
    status.textContent = '画像を保存中…';
    const filename = await bridge.pasteImage(png);
    target.insert(filename); // Insert before releasing the queue to a following Save As/close.
    refresh();
  });
}

async function checkExternal(): Promise<void> {
  if (!ready) return;
  const changed = await bridge.checkExternal();
  const notice = document.querySelector<HTMLElement>('#notice')!;
  notice.hidden = !changed;
  notice.querySelector('span')!.textContent =
    'ファイルが外部で変更・削除されたか、読み取れません。編集内容を保持しています。';
  if (changed) externalSync.changed();
}

async function close(): Promise<void> {
  if (!ready) return;
  // Wait for a toolbar/shortcut save, including its native picker, before asking to close.
  await saves.run(async () => undefined);
  let discard = false;
  if (state.dirty) {
    const choice = await confirmDialog(
      '変更を保存しますか？',
      state.path ?? '新規文書',
      [
        { value: 'save', label: '保存' },
        { value: 'discard', label: '保存せず閉じる' },
        { value: 'cancel', label: 'キャンセル' },
      ],
    );
    if (choice === 'cancel') return;
    if (choice === 'save' && !(await save())) return;
    // After any async save, use the CURRENT revision. Added edits keep the window open.
    discard = choice === 'discard';
  }
  exclusive = true;
  editor.setReadOnly(true);
  try {
    await bridge.close(state.text, state.revision, discard);
  } finally {
    exclusive = false;
    editor.setReadOnly(state.readOnly);
  }
}

async function reload(): Promise<void> {
  await saves.run(async () => undefined);
  if (state.dirty) {
    const choice = await confirmDialog(
      '再読み込みしますか？',
      '未保存の編集を破棄して、ディスクの内容を読み込みます。',
      [
        { value: 'reload', label: '編集を破棄して再読み込み' },
        { value: 'cancel', label: 'キャンセル' },
      ],
    );
    if (choice !== 'reload') return;
  }
  exclusive = true;
  editor.setReadOnly(true);
  try {
    const snapshot = await bridge.reload(state.text, state.revision);
    state.load(snapshot);
    editor.reload(state.text, state.readOnly, onEdit);
  } finally {
    exclusive = false;
    editor.setReadOnly(state.readOnly);
  }
  status.classList.remove('error');
  refresh();
  preview.update(state.text);
  await checkExternal();
}

const handlers: Record<string, () => Promise<unknown> | void> = {
  new: bridge.newDocument,
  open: bridge.open,
  save: () => save(),
  'save-as': () => save(true),
  search: () => editor.search(),
  reload: () => operations.run(reload),
};
for (const [id, handler] of Object.entries(handlers)) {
  document.getElementById(id)!.addEventListener('click', () => {
    if (ready) guard(async () => handler());
  });
}
document.querySelector<HTMLInputElement>('#remote')!.onchange = (event) =>
  preview.allowRemote((event.target as HTMLInputElement).checked);
document.addEventListener(
  'keydown',
  (event) => {
    if (
      !ready ||
      event.isComposing ||
      event.keyCode === 229 ||
      !event.ctrlKey ||
      event.altKey ||
      document.querySelector<HTMLDialogElement>('#confirm')!.open
    )
      return;
    const key = event.key.toLowerCase();
    const action =
      key === 'n'
        ? handlers.new
        : key === 'o'
          ? handlers.open
          : key === 's'
            ? () => save(event.shiftKey)
            : key === 'w'
              ? bridge.requestClose
              : undefined;
    if (action) {
      event.preventDefault();
      guard(async () => action());
    }
  },
  { capture: true },
);
window.addEventListener('focus', () => guard(checkExternal));
document.addEventListener('compositionend', () => guard(checkExternal));

async function start(): Promise<void> {
  setupSplit();
  // Register targeted events BEFORE loading state; backend owns startup documents already.
  await getCurrentWebviewWindow().listen('document-close-requested', () => {
    if (ready) guard(() => operations.run(close));
  });
  await getCurrentWebviewWindow().listen('document-external', () =>
    guard(checkExternal),
  );
  state.load(await bridge.snapshot());
  editor = new MarkdownEditor(
    document.querySelector('#editor')!,
    state.text,
    state.readOnly,
    onEdit,
    { persist: pasteImage, report },
  );
  ready = true;
  refresh();
  preview.update(state.text);
  editor.focus();
  await checkExternal();
}
guard(start);
