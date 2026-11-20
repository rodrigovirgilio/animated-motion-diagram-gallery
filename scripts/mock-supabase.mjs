import { createServer } from 'node:http';
import { loadGallery } from './lib.mjs';

/**
 * Supabase REST mínimo para testar o fluxo localmente, sem projeto real.
 * Implementa só o que o app e o script de sync usam:
 *   GET/POST/DELETE em /rest/v1/templates e /rest/v1/themes.
 *
 * Uso:
 *   npm run mock
 *   MOCK_SEED=1 npm run mock
 *
 * Depois:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=test-service npm run sync
 */

const port = Number(process.env.PORT ?? 54321);
const anonKey = process.env.MOCK_ANON_KEY ?? 'test-anon';
const serviceKey = process.env.MOCK_SERVICE_KEY ?? 'test-service';

const tables = {
  templates: new Map(),
  themes: new Map(),
};

if (process.env.MOCK_SEED === '1') {
  const { templates, themes } = loadGallery();
  for (const { doc } of templates) {
    tables.templates.set(doc.slug, {
      id: doc.slug,
      name: doc.name,
      description: doc.description,
      data: doc.data,
      published: true,
      source: 'github',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  for (const { doc } of themes) {
    tables.themes.set(doc.id, {
      id: doc.id,
      name: doc.name,
      data: doc,
      published: true,
      source: 'github',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range',
};

function send(res, status, body, extra = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...cors,
    'Content-Type': 'application/json',
    ...extra,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseIn(value) {
  const inner = value.slice(4, -1);
  return inner
    .split(',')
    .map((part) => part.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function applyQuery(rows, params) {
  let out = [...rows];

  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    if (value.startsWith('eq.')) {
      const raw = value.slice(3);
      const expected = raw === 'true' ? true : raw === 'false' ? false : raw;
      out = out.filter((row) => row[key] === expected);
    } else if (value.startsWith('in.(')) {
      const ids = new Set(parseIn(value));
      out = out.filter((row) => ids.has(String(row[key])));
    }
  }

  const order = params.get('order');
  if (order) {
    const [column, direction = 'asc'] = order.split('.');
    out.sort((a, b) => {
      const av = String(a[column] ?? '');
      const bv = String(b[column] ?? '');
      return direction === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }

  const limit = Number(params.get('limit'));
  if (Number.isInteger(limit) && limit >= 0) out = out.slice(0, limit);

  const select = params.get('select');
  if (select) {
    const columns = select.split(',').map((column) => column.trim()).filter(Boolean);
    out = out.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
  }

  return out;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health') {
    send(res, 200, {
      ok: true,
      templates: tables.templates.size,
      themes: tables.themes.size,
    });
    return;
  }

  const match = url.pathname.match(/^\/rest\/v1\/(templates|themes)$/);
  if (!match) {
    send(res, 404, { message: 'Not found' });
    return;
  }

  const tableName = match[1];
  const table = tables[tableName];
  const apiKey = String(req.headers.apikey ?? '');
  const isService = apiKey === serviceKey;
  const isAnon = apiKey === anonKey;

  if (!isService && !isAnon) {
    send(res, 401, { message: 'Invalid API key' });
    return;
  }

  console.log(`${req.method} ${url.pathname}${url.search}`);

  if (req.method === 'GET') {
    let rows = [...table.values()];
    if (!isService) rows = rows.filter((row) => row.published === true);
    send(res, 200, applyQuery(rows, url.searchParams), {
      'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    });
    return;
  }

  if (!isService) {
    send(res, 403, { message: 'new row violates row-level security policy' });
    return;
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      send(res, 400, { message: error.message });
      return;
    }
    const rows = Array.isArray(body) ? body : [body];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || row.id === undefined) {
        send(res, 400, { message: 'every row needs an id' });
        return;
      }
      const id = String(row.id);
      const existing = table.get(id);
      table.set(id, {
        ...existing,
        ...row,
        id,
        created_at: existing?.created_at ?? row.created_at ?? new Date().toISOString(),
      });
    }
    if (String(req.headers.prefer ?? '').includes('return=representation')) {
      send(res, 201, rows.map((row) => table.get(String(row.id))));
    } else {
      send(res, 201, undefined);
    }
    return;
  }

  if (req.method === 'DELETE') {
    const ids = new Set();
    for (const [key, value] of url.searchParams) {
      if (key === 'id' && value.startsWith('in.(')) for (const id of parseIn(value)) ids.add(id);
      if (key === 'id' && value.startsWith('eq.')) ids.add(value.slice(3));
    }
    let removed = 0;
    for (const id of ids) if (table.delete(id)) removed += 1;
    console.log(`   deleted ${removed} row(s)`);
    send(res, 204, undefined);
    return;
  }

  send(res, 405, { message: 'Method not allowed' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock Supabase listening on http://127.0.0.1:${port}`);
  console.log(`  anon key:    ${anonKey}`);
  console.log(`  service key: ${serviceKey}`);
  console.log('  in-memory only; restart clears everything');
});
