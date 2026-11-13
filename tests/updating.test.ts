import { expect, it, vi } from 'vitest';
import { runUpdate } from '../src/updating';

function setup(available = true) {
  const bridge = {
    checkUpdate: vi.fn().mockResolvedValue({
      currentVersion: '0.1.20',
      available: available
        ? { version: '0.1.21', bytes: 6 * 1024 * 1024 }
        : null,
    }),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    beginUpdate: vi.fn().mockResolvedValue(undefined),
    cancelUpdate: vi.fn().mockResolvedValue(undefined),
  };
  return {
    bridge,
    dialog: vi.fn().mockResolvedValue('update'),
    progress: vi.fn(),
  };
}
it('reports the current version without downloading when already current', async () => {
  const { bridge, dialog, progress } = setup(false);
  await runUpdate(bridge, dialog, progress);
  expect(dialog.mock.calls[0][1]).toContain('0.1.20');
  expect(bridge.downloadUpdate).not.toHaveBeenCalled();
  expect(bridge.beginUpdate).not.toHaveBeenCalled();
});
it('leaves every document open when the offer is cancelled', async () => {
  const { bridge, dialog, progress } = setup();
  dialog.mockResolvedValue('cancel');
  await runUpdate(bridge, dialog, progress);
  expect(dialog.mock.calls[0][1]).toContain('未保存');
  expect(bridge.cancelUpdate).toHaveBeenCalledOnce();
  expect(bridge.downloadUpdate).not.toHaveBeenCalled();
  expect(bridge.beginUpdate).not.toHaveBeenCalled();
});
it('begins closing only after a verified download succeeds', async () => {
  const { bridge, dialog, progress } = setup();
  const order: string[] = [];
  bridge.downloadUpdate.mockImplementation(async () => {
    order.push('download verified');
  });
  bridge.beginUpdate.mockImplementation(async () => {
    order.push('begin close');
  });
  await runUpdate(bridge, dialog, progress);
  expect(order).toEqual(['download verified', 'begin close']);
  expect(bridge.cancelUpdate).not.toHaveBeenCalled();
  expect(dialog.mock.calls[0][1]).toContain('0.1.20 → 0.1.21');
});
it('does not close documents or install after a download or checksum failure', async () => {
  const { bridge, dialog, progress } = setup();
  bridge.downloadUpdate.mockRejectedValue(new Error('checksum mismatch'));
  await expect(runUpdate(bridge, dialog, progress)).rejects.toThrow(
    'checksum mismatch',
  );
  expect(bridge.cancelUpdate).toHaveBeenCalledOnce();
  expect(bridge.beginUpdate).not.toHaveBeenCalled();
});
it('releases the update reservation when another dialog prevents confirmation', async () => {
  const { bridge, dialog, progress } = setup();
  dialog.mockRejectedValue(new Error('another operation is in progress'));
  await expect(runUpdate(bridge, dialog, progress)).rejects.toThrow(
    'another operation',
  );
  expect(bridge.cancelUpdate).toHaveBeenCalledOnce();
  expect(bridge.downloadUpdate).not.toHaveBeenCalled();
  expect(bridge.beginUpdate).not.toHaveBeenCalled();
});
