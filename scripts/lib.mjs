import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

/** Themes that ship inside the app and cannot be redefined by a submission. */
export const BUILTIN_THEMES = new Set(['sketch', 'lego', 'neon', 'terminal', 'matrix', 'gta']);

export const NODE_KINDS = new Set([
  'client',
  'gateway',
  'server',
  'database',
  'cache',
  'cloud',
  'queue',
  'file',
]);

const MAX = { nodes: 80, edges: 120, steps: 120 };
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const STEP_KINDS = new Set(['reveal', 'travel', 'pulse', 'hold']);
const ARROWS = new Set(['end', 'both', 'none']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

const relPath = (root, file) => relative(root, file).split(sep).join('/');

function text(value, max) {
  return typeof value === 'string' && value.length <= max;
}

/* ------------------------------------------------------------------ *
 * Theme validation
 * ------------------------------------------------------------------ */

export function validateTheme(doc, file = 'theme.json') {
  const e = [];
  const add = (msg) => e.push(`${file}: ${msg}`);

  if (!isObj(doc)) {
    add('must be a JSON object');
    return e;
  }

  if (typeof doc.id !== 'string' || !SLUG.test(doc.id)) {
    add('`id` must be a lowercase slug (3-40 chars: a-z, 0-9, -)');
  } else if (BUILTIN_THEMES.has(doc.id)) {
    add(`\`id\` "${doc.id}" is a built-in theme; pick another id`);
  }

  if (!text(doc.name, 40) || !doc.name.trim()) {
    add('`name` is required (1-40 chars)');
  }

  if (!Array.isArray(doc.palette) || doc.palette.length < 2 || doc.palette.length > 12) {
    add('`palette` must have 2-12 colors');
  } else {
    doc.palette.forEach((color, i) => {
      if (!text(color, 32) || !color.trim()) add(`\`palette[${i}]\` must be a non-empty string`);
    });
  }

  for (const key of ['bg', 'ink', 'muted', 'card', 'stroke', 'accent', 'marker', 'edge']) {
    if (!text(doc[key], 64) || !doc[key].trim()) {
      add(`\`${key}\` is required (CSS color, max 64 chars)`);
    }
  }

  for (const key of ['titleFont', 'bodyFont']) {
    if (!text(doc[key], 80) || !doc[key].trim()) {
      add(`\`${key}\` is required (max 80 chars)`);
    } else if (doc[key].includes(',')) {
      add(`\`${key}\` must be a single font family (Canvas 2D ignores fallbacks)`);
    }
  }

  const ranges = {
    strokeW: [0, 10],
    radius: [0, 40],
    glow: [0, 40],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (doc[key] !== undefined && (!isNum(doc[key]) || doc[key] < min || doc[key] > max)) {
      add(`\`${key}\` must be a number between ${min} and ${max}`);
    }
  }

  if (doc.weights !== undefined) {
    if (!isObj(doc.weights)) add('`weights` must be an object');
    else {
      for (const key of ['title', 'label']) {
        if (
          doc.weights[key] !== undefined &&
          (!isNum(doc.weights[key]) || doc.weights[key] < 100 || doc.weights[key] > 900)
        ) {
          add(`\`weights.${key}\` must be between 100 and 900`);
        }
      }
    }
  }

  if (doc.dot !== undefined) {
    if (!isObj(doc.dot)) add('`dot` must be an object');
    else {
      if (!text(doc.dot.color, 64)) add('`dot.color` must be a string');
      if (doc.dot.size !== undefined && (!isNum(doc.dot.size) || doc.dot.size < 0.2 || doc.dot.size > 10)) {
        add('`dot.size` must be between 0.2 and 10');
      }
      if (doc.dot.gap !== undefined && (!isNum(doc.dot.gap) || doc.dot.gap < 4 || doc.dot.gap > 100)) {
        add('`dot.gap` must be between 4 and 100');
      }
    }
  }

  if (doc.grid !== undefined && !text(doc.grid, 64)) add('`grid` must be a string (max 64 chars)');
  if (doc.shadow !== undefined && doc.shadow !== null && !text(doc.shadow, 64)) {
    add('`shadow` must be null or a string (max 64 chars)');
  }
  if (doc.captionStyle !== undefined && !['pill', 'bare'].includes(doc.captionStyle)) {
    add('`captionStyle` must be "pill" or "bare"');
  }
  for (const key of ['studs', 'upperTitle']) {
    if (doc[key] !== undefined && typeof doc[key] !== 'boolean') add(`\`${key}\` must be a boolean`);
  }

  return e;
}

/* ------------------------------------------------------------------ *
 * Diagram / template validation
 * ------------------------------------------------------------------ */

export function validateTemplate(doc, file = 'template.json', availableThemes = BUILTIN_THEMES) {
  const e = [];
  const add = (msg) => e.push(`${file}: ${msg}`);

  if (!isObj(doc)) {
    add('must be a JSON object');
    return e;
  }

  if (typeof doc.slug !== 'string' || !SLUG.test(doc.slug)) {
    add('`slug` must be a lowercase slug (3-40 chars: a-z, 0-9, -)');
  }
  if (!text(doc.name, 80) || !doc.name.trim()) {
    add('`name` is required (1-80 chars)');
  }
  if (typeof doc.description !== 'string' || doc.description.length > 200) {
    add('`description` must be a string (max 200 chars)');
  }
  if (typeof doc.theme !== 'string' || !SLUG.test(doc.theme)) {
    add('`theme` must be a lowercase slug');
  } else if (!availableThemes.has(doc.theme)) {
    add(`\`theme\` "${doc.theme}" is neither built-in nor present in themes/`);
  }

  const d = doc.data;
  if (!isObj(d)) {
    add('`data` must be the diagram object');
    return e;
  }

  if (typeof d.title !== 'string' || d.title.length > 160) add('`data.title` must be a string (max 160)');
  if (typeof d.subtitle !== 'string' || d.subtitle.length > 240) {
    add('`data.subtitle` must be a string (max 240)');
  }
  if (d.theme !== doc.theme) add('`data.theme` must match `theme`');

  if (!Array.isArray(d.nodes)) {
    add('`data.nodes` must be an array');
    return e;
  }
  if (d.nodes.length < 2 || d.nodes.length > MAX.nodes) {
    add(`\`data.nodes\` must have 2-${MAX.nodes} nodes`);
  }
  if (!Array.isArray(d.edges) || d.edges.length > MAX.edges) {
    add(`\`data.edges\` must be an array with at most ${MAX.edges} edges`);
  }
  if (!Array.isArray(d.steps) || d.steps.length < 1 || d.steps.length > MAX.steps) {
    add(`\`data.steps\` must have 1-${MAX.steps} steps`);
  }
  if (e.length) return e;

  const nodeIds = new Set();
  d.nodes.forEach((n, i) => {
    const at = `data.nodes[${i}]`;
    if (!isObj(n)) return add(`${at} must be an object`);
    if (typeof n.id !== 'string' || !n.id.trim() || n.id.length > 40) {
      add(`${at}.id is required (max 40 chars)`);
    } else if (nodeIds.has(n.id)) {
      add(`${at}.id "${n.id}" is duplicated`);
    } else {
      nodeIds.add(n.id);
    }
    if (typeof n.kind !== 'string' || !NODE_KINDS.has(n.kind)) add(`${at}.kind is invalid`);
    if (typeof n.label !== 'string' || n.label.length > 120) add(`${at}.label must be a string (max 120)`);
    for (const [key, min, max] of [
      ['x', -2000, 3600],
      ['y', -2000, 2700],
      ['w', 40, 800],
      ['h', 30, 400],
    ]) {
      if (!isNum(n[key]) || n[key] < min || n[key] > max) {
        add(`${at}.${key} must be a number between ${min} and ${max}`);
      }
    }
    if (n.tint !== undefined && !/^#[0-9a-f]{3,8}$/i.test(String(n.tint))) {
      add(`${at}.tint must be a hex color`);
    }
  });

  const edgeIds = new Set();
  (d.edges ?? []).forEach((edge, i) => {
    const at = `data.edges[${i}]`;
    if (!isObj(edge)) return add(`${at} must be an object`);
    if (typeof edge.id !== 'string' || !edge.id.trim() || edge.id.length > 40) {
      add(`${at}.id is required (max 40 chars)`);
    } else if (edgeIds.has(edge.id)) {
      add(`${at}.id "${edge.id}" is duplicated`);
    } else {
      edgeIds.add(edge.id);
    }
    if (!nodeIds.has(edge.from)) add(`${at}.from must reference an existing node`);
    if (!nodeIds.has(edge.to)) add(`${at}.to must reference an existing node`);
    if (edge.from === edge.to) add(`${at} cannot be a self-loop`);
    if (edge.label !== undefined && (typeof edge.label !== 'string' || edge.label.length > 120)) {
      add(`${at}.label must be a string (max 120)`);
    }
    if (edge.curve !== undefined && (!isNum(edge.curve) || edge.curve < -2 || edge.curve > 2)) {
      add(`${at}.curve must be between -2 and 2`);
    }
    if (edge.weight !== undefined && (!isNum(edge.weight) || edge.weight < 0.25 || edge.weight > 4)) {
      add(`${at}.weight must be between 0.25 and 4`);
    }
    if (edge.arrow !== undefined && !ARROWS.has(edge.arrow)) add(`${at}.arrow must be end, both or none`);
    if (edge.flowSpeed !== undefined && (!isNum(edge.flowSpeed) || edge.flowSpeed < 0.1 || edge.flowSpeed > 6)) {
      add(`${at}.flowSpeed must be between 0.1 and 6`);
    }
    if (
      edge.flowDots !== undefined &&
      (!Number.isInteger(edge.flowDots) || edge.flowDots < 1 || edge.flowDots > 12)
    ) {
      add(`${at}.flowDots must be an integer between 1 and 12`);
    }
    for (const key of ['dashed', 'draw', 'flow']) {
      if (edge[key] !== undefined && typeof edge[key] !== 'boolean') add(`${at}.${key} must be a boolean`);
    }
  });

  const stepIds = new Set();
  d.steps.forEach((step, i) => {
    const at = `data.steps[${i}]`;
    if (!isObj(step)) return add(`${at} must be an object`);
    if (typeof step.id !== 'string' || !step.id.trim() || step.id.length > 40) {
      add(`${at}.id is required (max 40 chars)`);
    } else if (stepIds.has(step.id)) {
      add(`${at}.id "${step.id}" is duplicated`);
    } else {
      stepIds.add(step.id);
    }
    if (!STEP_KINDS.has(step.kind)) add(`${at}.kind must be reveal, travel, pulse or hold`);
    if (!isNum(step.dur) || step.dur < 0.1 || step.dur > 30) {
      add(`${at}.dur must be between 0.1 and 30 seconds`);
    }
    if (step.text !== undefined && (typeof step.text !== 'string' || step.text.length > 200)) {
      add(`${at}.text must be a string (max 200)`);
    }
    if (step.kind === 'reveal' || step.kind === 'pulse') {
      if (!Array.isArray(step.nodes) || step.nodes.length < 1) {
        add(`${at}.nodes must be a non-empty array`);
      } else {
        for (const id of step.nodes) {
          if (!nodeIds.has(id)) add(`${at}.nodes references unknown node "${id}"`);
        }
      }
    }
    if (step.kind === 'travel' && !edgeIds.has(step.edge)) {
      add(`${at}.edge must reference an existing edge`);
    }
  });

  return e;
}

/* ------------------------------------------------------------------ *
 * Gallery loading + manifest
 * ------------------------------------------------------------------ */

export function loadGallery(root = process.cwd()) {
  const errors = [];
  const themeFiles = [];
  const templateFiles = [];

  for (const full of walk(join(root, 'themes'))) {
    const rel = relPath(root, full);
    const match = rel.match(/^themes\/([a-z0-9-]+)\.json$/);
    if (!match) {
      errors.push(`${rel}: themes must live at themes/<id>.json`);
      continue;
    }
    themeFiles.push({ full, rel, id: match[1] });
  }

  for (const full of walk(join(root, 'templates'))) {
    const rel = relPath(root, full);
    const match = rel.match(/^templates\/([a-z0-9-]+)\/([a-z0-9-]+)\.json$/);
    if (!match) {
      errors.push(`${rel}: templates must live at templates/<theme>/<slug>.json`);
      continue;
    }
    templateFiles.push({ full, rel, theme: match[1], slug: match[2] });
  }

  const themes = [];
  const themeIds = new Set();
  for (const entry of themeFiles) {
    let doc;
    try {
      doc = readJson(entry.full);
    } catch (err) {
      errors.push(`${entry.rel}: invalid JSON (${err.message})`);
      continue;
    }
    const found = validateTheme(doc, entry.rel);
    errors.push(...found);
    if (doc?.id !== entry.id) {
      errors.push(`${entry.rel}: \`id\` must equal the file name "${entry.id}"`);
    }
    if (themeIds.has(entry.id)) {
      errors.push(`${entry.rel}: duplicate theme id "${entry.id}"`);
    } else {
      themeIds.add(entry.id);
    }
    themes.push({ doc, path: entry.rel });
  }

  const availableThemes = new Set([...BUILTIN_THEMES, ...themeIds]);
  const templates = [];
  const slugs = new Set();
  for (const entry of templateFiles) {
    let doc;
    try {
      doc = readJson(entry.full);
    } catch (err) {
      errors.push(`${entry.rel}: invalid JSON (${err.message})`);
      continue;
    }
    const found = validateTemplate(doc, entry.rel, availableThemes);
    errors.push(...found);
    if (doc?.slug !== entry.slug) {
      errors.push(`${entry.rel}: \`slug\` must equal the file name "${entry.slug}"`);
    }
    if (doc?.theme !== entry.theme) {
      errors.push(`${entry.rel}: \`theme\` must equal the folder name "${entry.theme}"`);
    }
    if (slugs.has(entry.slug)) {
      errors.push(`${entry.rel}: duplicate template slug "${entry.slug}"`);
    } else {
      slugs.add(entry.slug);
    }
    templates.push({ doc, path: entry.rel });
  }

  return { templates, themes, errors };
}

export function buildManifest(root = process.cwd()) {
  const { templates, themes, errors } = loadGallery(root);
  if (errors.length) {
    const err = new Error('Gallery validation failed');
    err.errors = errors;
    throw err;
  }

  return {
    version: 1,
    templates: templates.map(({ doc, path }) => ({
      slug: doc.slug,
      name: doc.name,
      description: doc.description,
      theme: doc.theme,
      path,
    })),
    themes: themes.map(({ doc, path }) => ({
      id: doc.id,
      name: doc.name,
      path,
    })),
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export { readJson };
