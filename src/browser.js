// Point d'entrée de l'application mobile : la conversion se fait sur le téléphone, sans serveur.
// Dans l'APK, CapacitorHttp remplace fetch() par une requête native (pas de blocage CORS).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { documentToMarkdown, parseOptions } from './core.js';

const MAX_BYTES = 5 * 1024 * 1024;

function normalizeUrl(input) {
  let value = String(input || '').trim();
  if (!value) throw new Error('Merci de saisir une URL.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw new Error('URL invalide.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Seules les URL http(s) sont acceptées.');
  return url.href;
}

async function fetchPage(url) {
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'fr,en;q=0.8' } });
  } catch {
    throw new Error('Impossible de récupérer la page. Vérifiez la connexion et l’URL.');
  }
  if (!res.ok) throw new Error(`Le site a répondu ${res.status}.`);
  const type = res.headers.get('content-type') || '';
  if (type && !/html|xml|text\/plain/i.test(type)) throw new Error(`Type de contenu non pris en charge : ${type.split(';')[0]}.`);
  const html = await res.text();
  if (html.length > MAX_BYTES) throw new Error('La page dépasse la taille maximale (5 Mo).');
  return { html, finalUrl: res.url || url };
}

function parse(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Donne au document l'URL de la page pour résoudre les liens relatifs.
  doc.querySelectorAll('base').forEach((b) => b.remove());
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  return doc;
}

/** Même contrat que POST /api/convert : { url } ou { html }, plus les options. */
async function convert(body) {
  const opts = parseOptions(body);
  let { html } = body;
  let source = body.url ? normalizeUrl(body.url) : 'https://example.invalid/';
  if (!html) {
    const page = await fetchPage(source);
    html = page.html;
    source = page.finalUrl;
  }
  const result = documentToMarkdown(parse(String(html), source), source, opts);
  return { ...result, url: source, options: opts };
}

const native = Capacitor.isNativePlatform();

async function share(title, text) {
  await Share.share({ title, text, dialogTitle: 'Partager le Markdown' });
}

async function save(name, text) {
  const path = `url2mark/${name}`;
  await Filesystem.writeFile({ path, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  return `Documents/${path}`;
}

// Plugin natif maison (MainActivity) : texte/URL reçus via « Partager → url2mark ».
const ShareReceiver = native ? registerPlugin('ShareReceiver') : null;
async function onSharedUrl(callback) {
  if (!ShareReceiver) return;
  const extract = (text) => (String(text || '').match(/https?:\/\/\S+/) || [text])[0];
  ShareReceiver.addListener('shared', ({ text }) => text && callback(extract(text)));
  const { text } = await ShareReceiver.getShared();
  if (text) callback(extract(text));
}

window.url2mark = { convert, share, save, onSharedUrl, native };
