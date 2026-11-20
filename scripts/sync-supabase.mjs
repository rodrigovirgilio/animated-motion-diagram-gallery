import { loadGallery } from './lib.mjs';

/**
 * Publica o conteúdo aprovado na branch main no Supabase.
 *
 * Segurança:
 *  - `SUPABASE_SERVICE_ROLE_KEY` só existe nos secrets do GitHub Actions.
 *  - Nunca é impressa nem enviada ao navegador.
 *  - A chave `anon` do app só lê linhas com `published = true` (RLS).
 *
 * Sem os secrets, o script termina com sucesso e apenas avisa: assim forks e
 * PRs não quebram, e o repositório continua clonável.
 */

const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (!url || !key) {
  console.log(
    '::warning title=Supabase not configured::Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as repository secrets to publish automatically.',
  );
  process.exit(0);
}

const { templates, themes, errors } = loadGallery();
if (errors.length) {
  console.error(`✗ refusing to publish ${errors.length} invalid file(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const now = new Date().toISOString();
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function request(path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} → ${res.status} ${body.slice(0, 500)}`);
  }
  return res;
}

async function upsert(table, rows) {
  if (rows.length === 0) {
    console.log(`• ${table}: nothing to publish`);
    return;
  }
  await request(`/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  console.log(`✓ ${table}: ${rows.length} row(s) upserted`);
}

async function prune(table, keep) {
  if (process.env.SYNC_PRUNE === 'false') {
    console.log(`• ${table}: prune disabled (SYNC_PRUNE=false)`);
    return;
  }

  const res = await request(`/rest/v1/${table}?select=id&source=eq.github&limit=1000`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${table}: unexpected prune response`);

  const stale = rows.map((row) => String(row.id)).filter((id) => !keep.has(id));
  if (stale.length === 0) {
    console.log(`✓ ${table}: no stale rows`);
    return;
  }

  const list = stale.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  await request(`/rest/v1/${table}?id=${encodeURIComponent(`in.(${list})`)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  console.log(`✓ ${table}: ${stale.length} stale row(s) removed`);
}

const templateRows = templates.map(({ doc }) => ({
  id: doc.slug,
  name: doc.name,
  description: doc.description,
  data: doc.data,
  published: true,
  source: 'github',
  updated_at: now,
}));

const themeRows = themes.map(({ doc }) => ({
  id: doc.id,
  name: doc.name,
  data: doc,
  published: true,
  source: 'github',
  updated_at: now,
}));

try {
  await upsert('templates', templateRows);
  await upsert('themes', themeRows);
  await prune('templates', new Set(templateRows.map((row) => row.id)));
  await prune('themes', new Set(themeRows.map((row) => row.id)));
  console.log(`\n✓ published to ${url}`);
} catch (error) {
  console.error(`\n✗ sync failed: ${error.message}`);
  process.exit(1);
}
