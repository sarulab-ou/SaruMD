/** A missing/slow image must be reported instead of silently omitted from a PDF. */
export async function waitForPrintImage(
  image: HTMLImageElement,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const loaded = () => {
      cleanup();
      if (image.naturalWidth > 0) resolve();
      else
        reject(new Error(`印刷画像を読み込めません: ${image.alt || '画像'}`));
    };
    const failed = () => {
      cleanup();
      reject(new Error(`印刷画像を読み込めません: ${image.alt || '画像'}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          '印刷画像の読み込みがタイムアウトしました。接続を確認して再実行してください。',
        ),
      );
    }, 15000);
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    if (image.complete) loaded();
  });
}
