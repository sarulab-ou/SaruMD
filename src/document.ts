export interface Snapshot {
  id: string;
  path: string | null;
  text: string;
  savedText: string;
  revision: number;
  format: { bom: boolean; lineEnding: 'LF' | 'CRLF' | 'Mixed' };
  readOnly: boolean;
  external: boolean;
}

/** Each WebView owns one instance. Saving acknowledges only the captured text. */
export class DocumentState {
  text = '';
  savedText = '';
  revision = 0;
  path: string | null = null;
  readOnly = false;
  format: Snapshot['format'] = { bom: false, lineEnding: 'LF' };
  get dirty(): boolean {
    return this.text !== this.savedText;
  }
  load(snapshot: Snapshot): void {
    this.text = snapshot.text;
    this.savedText = snapshot.savedText;
    this.revision = snapshot.revision;
    this.path = snapshot.path;
    this.format = snapshot.format;
    this.readOnly = snapshot.readOnly;
  }
  edit(text: string): void {
    this.text = text;
    this.revision++;
  }
  acknowledge(snapshot: Snapshot): void {
    this.savedText = snapshot.savedText;
    this.path = snapshot.path;
    this.format = snapshot.format;
  }
}

export class SerialTasks {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
