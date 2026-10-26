import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { htmlToMarkdown, parseOptions } from './src/convert.js';
import { fetchPage, FetchError } from './src/fetch.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const MAX_HTML = '5mb';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Made-By', 'michben');
    next();
  });
  app.use(express.json({ limit: MAX_HTML }));

  async function convert(req, res) {
    const input = { ...req.query, ...(req.body || {}) };
    const opts = parseOptions(input);
    try {
      let html = input.html;
      let source = input.url || 'https://example.invalid/';
      if (!html) {
        const page = await fetchPage(input.url);
        html = page.html;
        source = page.finalUrl;
      }
      const result = htmlToMarkdown(String(html), source, opts);
      if (input.format === 'text' || input.format === 'md') {
        res.type('text/markdown; charset=utf-8');
        if (result.title) res.set('X-Title', encodeURIComponent(result.title));
        return res.send(result.markdown);
      }
      res.json({ ...result, url: source, options: opts });
    } catch (err) {
      const status = err instanceof FetchError ? err.status : 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: status === 500 ? 'Erreur interne lors de la conversion.' : err.message });
    }
  }

  app.get('/api/convert', convert);
  app.post('/api/convert', convert);
  app.get('/api/health', (_req, res) => res.json({ ok: true, by: 'michben' }));

  app.use('/vendor/marked', express.static(path.join(root, 'node_modules/marked/lib')));
  app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`url2mark par michben → http://localhost:${port}`));
}
