import { markdownHtml } from './markdown';
self.onmessage = (event: MessageEvent<{ revision: number; text: string }>) => {
  try {
    self.postMessage({
      revision: event.data.revision,
      html: markdownHtml(event.data.text),
    });
  } catch (error) {
    self.postMessage({ revision: event.data.revision, error: String(error) });
  }
};
