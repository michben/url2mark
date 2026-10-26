import { JSDOM, VirtualConsole } from 'jsdom';
import { documentToMarkdown } from './core.js';

export { DEFAULT_OPTIONS, parseOptions, countWords } from './core.js';

/** Convertit du HTML en Markdown (côté serveur, via jsdom). */
export function htmlToMarkdown(html, url = 'https://example.invalid/', options = {}) {
  // Les CSS/scripts des pages ne nous intéressent pas : on coupe les logs.
  const virtualConsole = new VirtualConsole();
  const { document } = new JSDOM(html, { url, virtualConsole }).window;
  return documentToMarkdown(document, url, options);
}
