import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { buildManifest, loadGallery, serializeManifest, validateTheme } from './lib.mjs';

const dirs = [];

function gallery(files) {
  const root = mkdtempSync(join(tmpdir(), 'amdi-gallery-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${JSON.stringify(content, null, 2)}\n`);
  }
  return root;
}

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function template(overrides = {}) {
  return {
    slug: 'demo',
    name: 'Demo',
    description: 'A demo',
    theme: 'lego',
    data: {
      title: 'Demo',
      subtitle: '',
      nodes: [
        { id: 'a', kind: 'server', label: 'A', x: 100, y: 300, w: 210, h: 96 },
        { id: 'b', kind: 'database', label: 'B', x: 500, y: 300, w: 210, h: 96 },
      ],
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
      steps: [{ id: 's1', kind: 'reveal', nodes: ['a'], dur: 1.2 }],
      theme: 'lego',
    },
    ...overrides,
  };
}

function theme(overrides = {}) {
  return {
    id: 'aurora',
    name: 'Aurora',
    bg: '#05070b',
    ink: '#e8f0ff',
    muted: '#8fa3bf',
    card: '#0d1420',
    stroke: '#2b3a52',
    accent: '#22d3ee',
    marker: '#fbbf24',
    edge: '#7dd3fc',
    titleFont: '"Space Grotesk"',
    bodyFont: '"VT323"',
    palette: ['#22d3ee', '#fbbf24'],
    ...overrides,
  };
}

test('aceita uma galeria válida e gera o manifesto', () => {
  const root = gallery({
    'templates/lego/demo.json': template(),
    'themes/aurora.json': theme(),
  });

  const { templates, themes, errors } = loadGallery(root);
  assert.deepEqual(errors, []);
  assert.equal(templates.length, 1);
  assert.equal(themes.length, 1);

  const manifest = buildManifest(root);
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.templates[0], {
    slug: 'demo',
    name: 'Demo',
    description: 'A demo',
    theme: 'lego',
    path: 'templates/lego/demo.json',
  });
  assert.deepEqual(manifest.themes[0], {
    id: 'aurora',
    name: 'Aurora',
    path: 'themes/aurora.json',
  });
  assert.equal(serializeManifest(manifest), `${JSON.stringify(manifest, null, 2)}\n`);
});

test('permite template usando um tema da comunidade', () => {
  const root = gallery({
    'themes/aurora.json': theme(),
    'templates/aurora/demo.json': template({
      theme: 'aurora',
      data: { ...template().data, theme: 'aurora' },
    }),
  });
  assert.deepEqual(loadGallery(root).errors, []);
});

test('rejeita slug, pasta e tema divergentes', () => {
  const root = gallery({
    'templates/lego/demo.json': template({ slug: 'outro', theme: 'neon' }),
  });
  const errors = loadGallery(root).errors.join('\n');
  assert.match(errors, /`slug` must equal the file name "demo"/);
  assert.match(errors, /`theme` must equal the folder name "lego"/);
  assert.match(errors, /`data\.theme` must match `theme`/);
});

test('rejeita referências quebradas em arestas e passos', () => {
  const root = gallery({
    'templates/lego/demo.json': template({
      data: {
        ...template().data,
        edges: [{ id: 'e1', from: 'a', to: 'nao-existe' }],
        steps: [
          { id: 's1', kind: 'travel', edge: 'e1', dur: 1 },
          { id: 's2', kind: 'reveal', nodes: ['fantasma'], dur: 1 },
        ],
      },
    }),
  });
  const errors = loadGallery(root).errors.join('\n');
  assert.match(errors, /edges\[0\]\.to must reference an existing node/);
  assert.match(errors, /steps\[1\]\.nodes references unknown node "fantasma"/);
});

test('rejeita tema inexistente', () => {
  const root = gallery({
    'templates/neon/demo.json': template({
      theme: 'neon',
      data: { ...template().data, theme: 'neon' },
    }),
    'themes/aurora.json': theme(),
  });
  const errors = loadGallery(root).errors.join('\n');
  // neon é embutido, então este caso precisa de um tema livre inexistente
  assert.equal(errors, '');

  const root2 = gallery({
    'templates/aurora/demo.json': template({
      theme: 'aurora',
      data: { ...template().data, theme: 'aurora' },
    }),
  });
  assert.match(loadGallery(root2).errors.join('\n'), /neither built-in nor present in themes\//);
});

test('rejeita id reservado e fontes com fallback', () => {
  const errors = validateTheme(theme({ id: 'lego', titleFont: '"Space Grotesk", sans-serif' }));
  assert.ok(errors.some((error) => error.includes('built-in theme')));
  assert.ok(errors.some((error) => error.includes('single font family')));
});

test('rejeita id de tema diferente do arquivo', () => {
  const root = gallery({ 'themes/aurora.json': theme({ id: 'outro' }) });
  assert.match(loadGallery(root).errors.join('\n'), /`id` must equal the file name "aurora"/);
});

test('rejeita slug duplicado em pastas diferentes', () => {
  const root = gallery({
    'templates/lego/demo.json': template(),
    'templates/neon/demo.json': template({
      theme: 'neon',
      data: { ...template().data, theme: 'neon' },
    }),
  });
  assert.match(loadGallery(root).errors.join('\n'), /duplicate template slug "demo"/);
});

test('rejeita arquivo fora do layout esperado', () => {
  const root = gallery({ 'templates/demo.json': template() });
  assert.match(
    loadGallery(root).errors.join('\n'),
    /templates must live at templates\/<theme>\/<slug>\.json/,
  );
});
