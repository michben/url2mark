import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (compatible; url2mark/1.0; +https://github.com/michben/url2mark)';

export class FetchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Plages d'adresses internes interdites (protection SSRF).
const blocked = new net.BlockList();
blocked.addSubnet('0.0.0.0', 8);
blocked.addSubnet('10.0.0.0', 8);
blocked.addSubnet('100.64.0.0', 10);
blocked.addSubnet('127.0.0.0', 8);
blocked.addSubnet('169.254.0.0', 16);
blocked.addSubnet('172.16.0.0', 12);
blocked.addSubnet('192.168.0.0', 16);
blocked.addSubnet('224.0.0.0', 4);
blocked.addSubnet('240.0.0.0', 4);
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');

export function isBlockedAddress(address) {
  // Adresse IPv4 encapsulée en IPv6 (::ffff:127.0.0.1) : on vérifie la partie IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) address = mapped[1];
  const family = net.isIPv6(address) ? 'ipv6' : 'ipv4';
  return blocked.check(address, family);
}

export function normalizeUrl(input) {
  let value = String(input || '').trim();
  if (!value) throw new FetchError('Merci de saisir une URL.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw new FetchError('URL invalide.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FetchError('Seules les URL http(s) sont acceptées.');
  return url;
}

async function assertPublicHost(url) {
  if (process.env.URL2MARK_ALLOW_PRIVATE === '1') return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new FetchError(`Impossible de résoudre « ${host} ».`);
  });
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new FetchError('Les adresses locales ou privées ne sont pas autorisées.', 403);
  }
}

async function readLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError('La page dépasse la taille maximale (5 Mo).', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function decode(buffer, contentType) {
  let charset = /charset=([^;]+)/i.exec(contentType || '')?.[1];
  if (!charset) {
    const head = buffer.subarray(0, 2048).toString('latin1');
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try { return new TextDecoder(charset?.trim() || 'utf-8').decode(buffer); } catch { return new TextDecoder().decode(buffer); }
}

/** Télécharge une page HTML publique et renvoie { html, finalUrl }. */
export async function fetchPage(input) {
  let url = normalizeUrl(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'fr,en;q=0.8' },
      });
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'délai dépassé' : err.cause?.code || err.message;
      throw new FetchError(`Impossible de récupérer la page (${reason}).`, 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new FetchError('Redirection non autorisée.', 502);
      continue;
    }
    if (!res.ok) throw new FetchError(`Le site a répondu ${res.status} ${res.statusText}.`, 502);
    const type = res.headers.get('content-type') || '';
    if (type && !/html|xml|text\/plain/i.test(type)) {
      throw new FetchError(`Type de contenu non pris en charge : ${type.split(';')[0]}.`, 415);
    }
    const html = decode(await readLimited(res), type);
    return { html, finalUrl: url.href, contentType: type };
  }
  throw new FetchError('Trop de redirections.', 502);
}
