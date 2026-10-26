import { describe, it, expect, vi } from 'vitest';
import { DocumentState, SerialTasks, type Snapshot } from '../src/document';
import { boundedDebounce } from '../src/scheduler';

const snapshot = (text = ''): Snapshot => ({
  id: 'doc-1',
  path: null,
  text,
  savedText: text,
  revision: 0,
  format: { bom: false, lineEnding: 'LF' },
  readOnly: false,
  external: false,
});

describe('document isolation and saving', () => {
  it('does not clear new edits when an older save completes', () => {
    const state = new DocumentState();
    state.load(snapshot());
    state.edit('保存対象');
    const saved = { ...snapshot('保存対象'), revision: 1, path: 'C:\\新規.md' };
    state.edit('保存対象＋追加');
    state.acknowledge(saved);
    expect(state.text).toBe('保存対象＋追加');
    expect(state.dirty).toBe(true);
    expect(state.revision).toBe(2);
  });
  it('keeps windows and Undo-back-to-saved state independent', () => {
    const a = new DocumentState(),
      b = new DocumentState();
    a.load(snapshot('a'));
    b.load(snapshot('b'));
    a.edit('a2');
    expect(b.text).toBe('b');
    expect(b.dirty).toBe(false);
    a.edit('a');
    expect(a.dirty).toBe(false);
  });
  it('serializes saves and continues after failure', async () => {
    const queue = new SerialTasks();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.run(async () => {
      events.push('a');
      await gate;
      throw new Error('disk');
    });
    const second = queue.run(async () => {
      events.push('b');
      return 2;
    });
    await Promise.resolve();
    expect(events).toEqual(['a']);
    release();
    await expect(first).rejects.toThrow('disk');
    await expect(second).resolves.toBe(2);
    expect(events).toEqual(['a', 'b']);
  });
});

describe('bounded preview scheduling', () => {
  it('debounces at 200 ms and flushes continuous input at 800 ms', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const schedule = boundedDebounce(task);
    for (let i = 0; i < 8; i++) {
      schedule();
      vi.advanceTimersByTime(100);
    }
    expect(task).toHaveBeenCalledTimes(1);
    schedule();
    vi.advanceTimersByTime(199);
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
