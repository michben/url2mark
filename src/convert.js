import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export const DEFAULT_OPTIONS = Object.freeze({
  readability: true, // extraire uniquement l'article principal
  title: true, // ajouter le titre en "# Titre"
  frontmatter: false, // ajouter un en-tête YAML (titre, source, auteur, date…)
  links: 'inline', // inline | reference | none
  images: true, // conserver les images
  tables: true, // tableaux GFM
});

const BOOL_OPTIONS = ['readability', 'title', 'frontmatter', 'images', 'tables'];
const LINK_STYLES = ['inline', 'reference', 'none'];

// Normalise des options venant d'une query string ou d'un corps JSON.
export function parseOptions(raw = {}) {
  const opts = { ...DEFAULT_OPTIONS };
  for (const key of BOOL_OPTIONS) {
    if (raw[key] === undefined) continue;
    const v = raw[key];
    opts[key] = !(v === false || v === 'false' || v === '0' || v === 'off' || v === 0);
  }
  if (LINK_STYLES.includes(raw.links)) opts.links = raw.links;
  return opts;
}

function quietDom(html, url) {
  // Les CSS/scripts des pages ne nous intéressent pas : on coupe les logs.
  const virtualConsole = new VirtualConsole();
  return new JSDOM(html, { url, virtualConsole });
}

function absolutize(doc) {
  for (const el of doc.querySelectorAll('a[href]')) {
    try { el.setAttribute('href', new URL(el.getAttribute('href'), doc.baseURI).href); } catch { /* lien invalide */ }
  }
  for (const el of doc.querySelectorAll('img')) {
    const src = el.getAttribute('src') || el.getAttribute('data-src');
    if (!src) continue;
    try { el.setAttribute('src', new URL(src, doc.baseURI).href); } catch { /* src invalide */ }
  }
}

function buildTurndown(opts) {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    linkStyle: opts.links === 'reference' ? 'referenced' : 'inlined',
    linkReferenceStyle: 'full',
  });
  if (opts.tables) td.use(gfm);
  else td.use([gfm.strikethrough, gfm.taskListItems]);

  td.remove(['script', 'style', 'noscript', 'iframe', 'form', 'button', 'svg']);

  // Garder le langage des blocs de code (<pre><code class="language-js">).
  td.addRule('fencedCodeWithLang', {
    filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
    replacement: (_content, node) => {
      const code = node.firstChild;
      const lang = (code.getAttribute('class') || '').match(/(?:language|lang)-([\w+#-]+)/)?.[1] || '';
      const text = code.textContent.replace(/\n$/, '');
      const fence = text.includes('```') ? '~~~' : '```';
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  });

  // "- item" plutôt que "-   item" (style par défaut de Turndown).
  td.addRule('compactListItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode;
      let prefix = `${options.bulletListMarker} `;
      if (parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start')) || 1;
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const indent = ' '.repeat(prefix.length);
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${indent}`);
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
    },
  });

  if (opts.links === 'none') {
    td.addRule('stripLinks', { filter: 'a', replacement: (content) => content });
  }
  if (!opts.images) {
    td.addRule('stripImages', { filter: ['img', 'picture', 'figure'], replacement: (content, node) => (node.nodeName === 'IMG' ? '' : content) });
  }
  return td;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function frontmatter(meta) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (v) lines.push(`${k}: ${yamlString(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function cleanup(md) {
  return md
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

export function countWords(md) {
  const text = md.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`[\]()!|-]/g, ' ');
  return (text.match(/[\p{L}\p{N}'’]+/gu) || []).length;
}

/**
 * Convertit du HTML en Markdown.
 * @returns {{ markdown: string, title: string, byline: string|null, excerpt: string|null, siteName: string|null, words: number, readingMinutes: number }}
 */
export function htmlToMarkdown(html, url = 'https://example.invalid/', options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const dom = quietDom(html, url);
  const doc = dom.window.document;
  absolutize(doc);

  const fallbackTitle = doc.querySelector('meta[property="og:title"]')?.content || doc.title || '';
  let title = fallbackTitle.trim();
  let byline = doc.querySelector('meta[name="author"]')?.content || null;
  let excerpt = doc.querySelector('meta[name="description"]')?.content || null;
  let siteName = doc.querySelector('meta[property="og:site_name"]')?.content || null;
  let contentHtml;

  if (opts.readability) {
    // Readability modifie le DOM : on lui donne une copie.
    const article = new Readability(doc.cloneNode(true), { keepClasses: true }).parse();
    if (article?.content) {
      contentHtml = article.content;
      title = (article.title || title).trim();
      byline = article.byline || byline;
      excerpt = article.excerpt || excerpt;
      siteName = article.siteName || siteName;
    }
  }
  if (!contentHtml) {
    for (const el of doc.querySelectorAll('script, style, noscript, nav, footer, header[role="banner"]')) el.remove();
    contentHtml = doc.body ? doc.body.innerHTML : html;
  }

  let body = buildTurndown(opts).turndown(contentHtml);

  // Évite un titre en double si le contenu commence déjà par ce titre.
  const startsWithTitle = title && body.trimStart().replace(/^#+\s*/, '').startsWith(title);
  let md = '';
  if (opts.frontmatter) {
    md += frontmatter({ title, source: url, author: byline, site: siteName, description: excerpt, date: new Date().toISOString().slice(0, 10) });
  }
  if (opts.title && title && !startsWithTitle) md += `# ${title}\n\n`;
  md += body;
  md = cleanup(md);

  const words = countWords(md);
  return { markdown: md, title, byline, excerpt, siteName, words, readingMinutes: Math.max(1, Math.round(words / 230)) };
}
