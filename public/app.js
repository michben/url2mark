(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const form = $('#convertForm');
  const urlInput = $('#urlInput');
  const htmlInput = $('#htmlInput');
  const output = $('#output');
  const preview = $('#preview');
  const panes = $('#panes');
  const errorBox = $('#error');
  const resultBox = $('#result');
  const SIGNATURE = '\n---\n\n*Converti avec [url2mark](https://github.com/michben/url2mark) · signé **michben***\n';
  const HISTORY_KEY = 'url2mark:history';
  const PREFS_KEY = 'url2mark:prefs';
  const THEME_KEY = 'url2mark:theme';

  // Dans l'APK Android, la conversion tourne sur le téléphone (voir src/browser.js).
  const local = window.url2mark || null;
  let mode = 'url';
  let current = null; // dernier résultat { title, url, ... }

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
    },
  };

  // ---------- Thème ----------
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || (prefersDark.matches ? 'dark' : 'light');
    if (current) renderPreview();
  }
  applyTheme(store.get(THEME_KEY, null));
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    store.set(THEME_KEY, next);
    applyTheme(next);
  });

  // ---------- Options ----------
  function readOptions() {
    const data = new FormData(form);
    const opts = {};
    for (const el of form.querySelectorAll('.options input[type=checkbox]')) opts[el.name] = el.checked;
    opts.links = data.get('links');
    return opts;
  }
  function restoreOptions() {
    const prefs = store.get(PREFS_KEY, {});
    for (const el of form.querySelectorAll('.options input[type=checkbox]')) {
      if (typeof prefs[el.name] === 'boolean') el.checked = prefs[el.name];
    }
    if (prefs.links) form.elements.links.value = prefs.links;
  }
  restoreOptions();
  form.querySelector('.options').addEventListener('change', () => {
    store.set(PREFS_KEY, readOptions());
    if (current) convert(); // reconvertit avec les nouvelles options
  });

  // ---------- Mode URL / HTML ----------
  for (const btn of document.querySelectorAll('.mode')) {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  }
  function setMode(next) {
    mode = next;
    for (const btn of document.querySelectorAll('.mode')) {
      const active = btn.dataset.mode === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active);
    }
    form.querySelector('[data-for=url]').classList.toggle('hidden', next !== 'url');
    form.querySelector('[data-for=html]').classList.toggle('hidden', next !== 'html');
    (next === 'url' ? urlInput : htmlInput).focus();
  }

  // ---------- Conversion ----------
  function setLoading(on) {
    for (const btn of form.querySelectorAll('button.primary')) {
      btn.disabled = on;
      btn.classList.toggle('loading', on);
    }
  }
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.toggle('hidden', !msg);
  }

  async function convert() {
    const opts = readOptions();
    const { signature, ...apiOpts } = opts;
    const body = { ...apiOpts };
    if (mode === 'url') {
      body.url = urlInput.value.trim();
      if (!body.url) return showError('Merci de saisir une URL.');
    } else {
      body.html = htmlInput.value;
      if (!body.html.trim()) return showError('Collez du HTML à convertir.');
    }
    showError('');
    setLoading(true);
    try {
      const data = local ? await local.convert(body) : await convertOnServer(body);
      if (signature) data.markdown = data.markdown.trimEnd() + '\n' + SIGNATURE;
      showResult({ ...data, source: mode === 'url' ? data.url : null });
      if (mode === 'url') {
        addHistory(data);
        const shareUrl = new URL(location.href);
        shareUrl.search = new URLSearchParams({ url: body.url }).toString();
        history.replaceState(null, '', shareUrl);
      }
    } catch (err) {
      showError(err.message === 'Failed to fetch' ? 'Serveur injoignable. Vérifiez votre connexion.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function convertOnServer(body) {
    const res = await fetch('api/convert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: `Erreur ${res.status}` }));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    convert();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement !== output) {
      e.preventDefault();
      convert();
    }
  });

  // ---------- Affichage ----------
  function stats(md) {
    const words = (md.match(/[\p{L}\p{N}'’]+/gu) || []).length;
    return `${words.toLocaleString('fr-FR')} mots · ~${Math.max(1, Math.round(words / 230))} min de lecture · ${md.length.toLocaleString('fr-FR')} caractères`;
  }
  function updateInfo() {
    const parts = [];
    if (current.source) parts.push(current.source);
    if (current.byline) parts.push(current.byline);
    parts.push(stats(output.value));
    $('#resultInfo').textContent = parts.join(' · ');
  }

  function showResult(data) {
    current = data;
    output.value = data.markdown;
    $('#resultTitle').textContent = data.title || 'Sans titre';
    updateInfo();
    resultBox.classList.remove('hidden');
    renderPreview();
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPreview() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const html = window.marked ? window.marked.parse(output.value) : `<pre>${escapeHtml(output.value)}</pre>`;
    // Iframe sandboxée sans scripts + CSP : le contenu converti ne peut rien exécuter.
    preview.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">
<base target="_blank"><style>
body{font:16px/1.65 system-ui,-apple-system,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;padding:20px 24px;
color:${dark ? '#ececf5' : '#17172b'};background:${dark ? '#181826' : '#fff'}}
a{color:#6d5dfc}img{max-width:100%;height:auto;border-radius:6px}
pre{background:${dark ? '#212133' : '#f4f4fa'};padding:12px;border-radius:8px;overflow:auto}
code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}
blockquote{margin:0;padding-left:14px;border-left:3px solid #6d5dfc;color:${dark ? '#9a9ab5' : '#64647d'}}
table{border-collapse:collapse}td,th{border:1px solid ${dark ? '#2c2c42' : '#e2e2ee'};padding:6px 10px}
hr{border:0;border-top:1px solid ${dark ? '#2c2c42' : '#e2e2ee'}}
</style></head><body>${html}</body></html>`;
  }

  let previewTimer;
  output.addEventListener('input', () => {
    if (!current) return;
    updateInfo();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 250);
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('.tab')) {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      }
      panes.dataset.view = tab.dataset.tab;
    });
  }

  // ---------- Actions ----------
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  $('#copyBtn').addEventListener('click', async () => {
    await copyText(output.value);
    toast('Markdown copié ✓');
  });

  $('#downloadBtn').addEventListener('click', async () => {
    const name = slugify(current?.title || 'page') + '.md';
    if (local?.native) {
      try {
        toast(`Enregistré dans ${await local.save(name, output.value)}`);
      } catch (err) {
        toast(`Échec de l'enregistrement : ${err.message}`);
      }
      return;
    }
    const blob = new Blob([output.value], { type: 'text/markdown;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`${name} téléchargé`);
  });

  $('#shareBtn').addEventListener('click', async () => {
    if (local?.native) {
      try { await local.share(current?.title || 'Markdown', output.value); } catch { /* partage annulé */ }
      return;
    }
    if (!current?.source) return toast('Lien disponible uniquement pour une URL');
    const link = new URL(location.pathname, location.origin);
    link.searchParams.set('url', current.source);
    await copyText(link.href);
    toast('Lien copié ✓');
  });

  // ---------- Historique ----------
  function addHistory(data) {
    const items = store.get(HISTORY_KEY, []).filter((h) => h.url !== data.url);
    items.unshift({ url: data.url, title: data.title, date: Date.now() });
    store.set(HISTORY_KEY, items.slice(0, 12));
    renderHistory();
  }
  function renderHistory() {
    const items = store.get(HISTORY_KEY, []);
    const list = $('#history');
    list.replaceChildren();
    $('#historySection').classList.toggle('hidden', items.length === 0);
    for (const item of items) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      const text = document.createElement('span');
      text.style.minWidth = '0';
      const t = Object.assign(document.createElement('div'), { className: 'h-title', textContent: item.title || item.url });
      const u = Object.assign(document.createElement('div'), { className: 'h-url', textContent: item.url });
      text.append(t, u);
      const d = Object.assign(document.createElement('span'), {
        className: 'h-date',
        textContent: new Date(item.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      });
      btn.append(text, d);
      btn.addEventListener('click', () => {
        setMode('url');
        urlInput.value = item.url;
        convert();
      });
      li.append(btn);
      list.append(li);
    }
  }
  $('#clearHistory').addEventListener('click', () => {
    store.set(HISTORY_KEY, []);
    renderHistory();
  });

  // ---------- Utilitaires ----------
  function slugify(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page';
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Démarrage ----------
  $('#year').textContent = new Date().getFullYear();
  for (const el of document.querySelectorAll('.origin')) el.textContent = location.origin;
  renderHistory();
  if (local?.native) {
    document.documentElement.classList.add('app');
    $('#downloadBtn').textContent = 'Enregistrer .md';
    $('#shareBtn').textContent = 'Partager';
    $('#shareBtn').title = 'Partager le Markdown vers une autre application';
    local.onSharedUrl((url) => {
      setMode('url');
      urlInput.value = url;
      convert();
    });
  }
  const initial = new URLSearchParams(location.search).get('url');
  if (initial) {
    urlInput.value = initial;
    convert();
  }
  console.log('%curl2mark — signé michben', 'color:#6d5dfc;font-weight:bold;font-size:14px');
})();
