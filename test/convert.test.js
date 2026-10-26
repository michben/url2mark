import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, parseOptions } from '../src/convert.js';
import { isBlockedAddress, normalizeUrl } from '../src/fetch.js';
import { createApp } from '../server.js';

const PAGE = `<!doctype html><html><head><title>Mon article</title><meta name="author" content="Alice"></head>
<body><nav><a href="/">Accueil</a> <a href="/blog">Blog</a></nav>
<article>
  <h1>Mon article</h1>
  <p>Premier paragraphe avec un <a href="/lien">lien relatif</a> et du <strong>gras</strong>. ${'Texte de remplissage pour que Readability considère ce bloc comme un article. '.repeat(12)}</p>
  <img src="/img/chat.png" alt="Un chat">
  <pre><code class="language-js">const a = 1;</code></pre>
  <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
  <p>${'Encore du contenu utile pour la lecture. '.repeat(10)}</p>
</article>
<footer>Pied de page</footer></body></html>`;
const URL_ = 'https://exemple.com/blog/article';

test('convertit un article avec titre, liens absolus, image, code et tableau', () => {
  const r = htmlToMarkdown(PAGE, URL_);
  assert.equal(r.title, 'Mon article');
  assert.match(r.markdown, /^# Mon article\n/);
  assert.equal(r.markdown.match(/^# Mon article$/gm).length, 1, 'pas de titre en double');
  assert.match(r.markdown, /\[lien relatif\]\(https:\/\/exemple\.com\/lien\)/);
  assert.match(r.markdown, /!\[Un chat\]\(https:\/\/exemple\.com\/img\/chat\.png\)/);
  assert.match(r.markdown, /```js\nconst a = 1;\n```/);
  assert.match(r.markdown, /\| A \| B \|/);
  assert.doesNotMatch(r.markdown, /Pied de page/);
  assert.ok(r.words > 50);
});

test('options : sans liens, sans images, liens en référence, front matter', () => {
  const none = htmlToMarkdown(PAGE, URL_, { links: 'none', images: false });
  assert.doesNotMatch(none.markdown, /\]\(/);
  assert.match(none.markdown, /lien relatif/);
  const ref = htmlToMarkdown(PAGE, URL_, { links: 'reference' });
  assert.match(ref.markdown, /\[lien relatif\]\[1\]/);
  assert.match(ref.markdown, /^\[1\]: https:\/\/exemple\.com\/lien$/m);
  const fm = htmlToMarkdown(PAGE, URL_, { frontmatter: true });
  assert.match(fm.markdown, /^---\ntitle: "Mon article"\nsource: "https:\/\/exemple\.com\/blog\/article"\n/);
});

test('mode page complète (sans Readability)', () => {
  const r = htmlToMarkdown('<html><head><title>T</title></head><body><p>Court</p></body></html>', URL_, { readability: false });
  assert.equal(r.markdown, '# T\n\nCourt\n');
});

test('parseOptions accepte les chaînes de la query string', () => {
  const o = parseOptions({ readability: 'false', images: '0', links: 'reference', title: 'true', links2: 'x' });
  assert.equal(o.readability, false);
  assert.equal(o.images, false);
  assert.equal(o.title, true);
  assert.equal(o.links, 'reference');
  assert.equal(parseOptions({ links: 'bogus' }).links, 'inline');
});

test('protection SSRF et normalisation des URL', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(isBlockedAddress(ip), ip);
  assert.ok(!isBlockedAddress('93.184.216.34'));
  assert.equal(normalizeUrl('exemple.com/x').href, 'https://exemple.com/x');
  assert.throws(() => normalizeUrl('ftp://exemple.com'));
  assert.throws(() => normalizeUrl(''));
});

test('API : HTML collé, format texte, URL locale refusée', async () => {
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    let res = await fetch(`${base}/api/convert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html: PAGE, url: URL_ }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-made-by'), 'michben');
    const json = await res.json();
    assert.equal(json.title, 'Mon article');

    res = await fetch(`${base}/api/convert`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html: '<p>Salut</p>', format: 'text', title: false, readability: false }) });
    assert.match(res.headers.get('content-type'), /text\/markdown/);
    assert.equal(await res.text(), 'Salut\n');

    res = await fetch(`${base}/api/convert?url=http://127.0.0.1:${server.address().port}/`);
    assert.equal(res.status, 403);

    res = await fetch(`${base}/`);
    assert.match(await res.text(), /michben/);
  } finally {
    server.close();
  }
});
