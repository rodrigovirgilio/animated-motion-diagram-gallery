import test from 'node:test';
import assert from 'node:assert/strict';
import { triage } from './triage-issue.mjs';

const validTheme = {
  id: 'sunset',
  name: 'Sunset',
  bg: '#f7f4ea',
  ink: '#1d1c19',
  muted: '#63605a',
  card: '#ffffff',
  stroke: '#23211d',
  accent: '#ef8b2c',
  marker: '#ef8b2c',
  edge: '#8f8b80',
  strokeW: 2.6,
  radius: 16,
  glow: 0,
  titleFont: '"Baloo 2"',
  bodyFont: '"Patrick Hand"',
  palette: ['#ef8b2c', '#d1495b'],
};

function themeBody(json) {
  return [
    '### Theme id',
    '',
    json.id,
    '',
    '### Theme name',
    '',
    json.name,
    '',
    '### Theme JSON',
    '',
    '```json',
    JSON.stringify(json, null, 2),
    '```',
    '',
    '### Confirmation',
    '',
    '- [x] This is my own work and I agree to publish it under the MIT license.',
  ].join('\n');
}

const validDiagram = {
  title: 'Retry',
  subtitle: '',
  theme: 'lego',
  nodes: [
    { id: 'a', kind: 'client', label: 'A', x: 100, y: 300, w: 210, h: 96 },
    { id: 'b', kind: 'server', label: 'B', x: 500, y: 300, w: 210, h: 96 },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b' }],
  steps: [{ id: 's1', kind: 'hold', dur: 1 }],
};

function templateBody({ slug = 'retry', name = 'Retry', description = 'A to B', theme = 'lego', diagram = validDiagram } = {}) {
  return [
    '### Slug',
    '',
    slug,
    '',
    '### Name',
    '',
    name,
    '',
    '### Description',
    '',
    description,
    '',
    '### Theme',
    '',
    theme,
    '',
    '### Diagram JSON',
    '',
    '```json',
    JSON.stringify(diagram, null, 2),
    '```',
    '',
    '### Confirmation',
    '',
    '- [x] This is my own work and I agree to publish it under the MIT license.',
  ].join('\n');
}

test('aceita um tema válido', () => {
  const v = triage(themeBody(validTheme));
  assert.equal(v.ok, true);
  assert.equal(v.kind, 'theme');
  assert.equal(v.id, 'sunset');
  assert.equal(v.file, 'themes/sunset.json');
});

test('recusa um tema com id embutido', () => {
  const v = triage(themeBody({ ...validTheme, id: 'sketch' }));
  assert.equal(v.ok, false);
  assert.match(v.errors.join('\n'), /built-in theme/);
});

test('recusa tema com paleta de uma cor', () => {
  const v = triage(themeBody({ ...validTheme, palette: ['#ef8b2c'] }));
  assert.equal(v.ok, false);
  assert.match(v.errors.join('\n'), /palette/);
});

test('recusa corpo sem JSON', () => {
  const v = triage('### Theme id\n\nsunset\n');
  assert.equal(v.ok, false);
  assert.equal(v.kind, 'unknown');
});

test('aceita um template válido', () => {
  const v = triage(templateBody());
  assert.equal(v.ok, true);
  assert.equal(v.kind, 'template');
  assert.equal(v.id, 'retry');
  assert.equal(v.file, 'templates/lego/retry.json');
});

test('recusa template com tema que não existe', () => {
  const v = triage(templateBody({ theme: 'no-such-theme', diagram: { ...validDiagram, theme: 'no-such-theme' } }));
  assert.equal(v.ok, false);
  assert.match(v.errors.join('\n'), /theme/);
});

test('recusa template com slug inválido', () => {
  const v = triage(templateBody({ slug: 'UPPER!' }));
  assert.equal(v.ok, false);
  assert.match(v.errors.join('\n'), /slug/);
});

test('recusa template com referência de aresta quebrada', () => {
  const bad = {
    ...validDiagram,
    edges: [{ id: 'e1', from: 'a', to: 'missing' }],
  };
  const v = triage(templateBody({ diagram: bad }));
  assert.equal(v.ok, false);
  assert.match(v.errors.join('\n'), /existing node/);
});
