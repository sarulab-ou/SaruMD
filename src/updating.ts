export interface UpdateOffer {
  currentVersion: string;
  available: { version: string; bytes: number } | null;
}

interface UpdateBridge {
  checkUpdate: () => Promise<UpdateOffer>;
  downloadUpdate: () => Promise<void>;
  beginUpdate: () => Promise<void>;
  cancelUpdate: () => Promise<void>;
}

type Dialog = (
  title: string,
  message: string,
  choices: { value: string; label: string }[],
) => Promise<string>;

export async function runUpdate(
  bridge: UpdateBridge,
  dialog: Dialog,
  progress: (message: string) => void,
): Promise<void> {
  progress('GitHubで更新を確認中…');
  const offer = await bridge.checkUpdate();
  if (!offer.available) {
    await dialog(
      '更新の確認',
      `新しい更新はありません。\n現在：SaruMD ${offer.currentVersion}`,
      [{ value: 'ok', label: 'OK' }],
    );
    progress('最新版を使用しています');
    return;
  }
  try {
    const choice = await dialog(
      'SaruMDの更新',
      `${offer.currentVersion} → ${offer.available.version}\nダウンロード: ${(offer.available.bytes / 1024 / 1024).toFixed(1)} MiB\n\nGitHubからダウンロードして検証後、すべての文書を順に閉じます。未保存の編集は保存確認し、キャンセルすると更新を止めます。終了後にインストーラーが起動し、更新後にSaruMDを再起動します。`,
      [
        { value: 'update', label: 'ダウンロードして更新' },
        { value: 'cancel', label: 'キャンセル' },
      ],
    );
    if (choice !== 'update') {
      await bridge.cancelUpdate();
      progress('更新をキャンセルしました');
      return;
    }
    progress('更新をダウンロード・検証中…');
    await bridge.downloadUpdate();
    progress('更新のため文書を閉じています…');
    await bridge.beginUpdate();
  } catch (error) {
    await bridge.cancelUpdate().catch(() => undefined);
    throw error;
  }
}
