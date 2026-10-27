export type ClipboardContents =
  { type: 'text'; text: string } | { type: 'image'; png: Uint8Array };

/** Local time: yyyy/mm/dd hh:mm:ss, using the 24-hour clock. */
export function formatTimestamp(date = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}/${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}
