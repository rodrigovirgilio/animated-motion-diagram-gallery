/**
 * Triage de issues de submissão (template ou tema).
 *
 * Lê o corpo da issue na stdin (o formato dos issue forms do GitHub) e devolve
 * um veredito em JSON na stdout:
 *
 *   { ok, kind: 'theme'|'template'|'unknown', id, file, errors: string[] }
 *
 * É a MESMA validação usada pelo CI (`validate.mjs`), então o que passa aqui
 * também passa no check `validate` quando virar um arquivo. O JSON da issue é
 * tratado como dado: apenas é parseado e inspecionado, nunca executado.
 *
 * Uso:
 *   node scripts/triage-issue.mjs [--comment-file comment.md] < body.md
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUILTIN_THEMES, validateTemplate, validateTheme } from './lib.mjs';

function readStdin() {
  return readFileSync(0, 'utf8');
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const safeId = (id) => (typeof id === 'string' && SLUG.test(id) ? id : 'submission');

/** Divide o corpo do issue form em `### Campo` → conteúdo. */
function sections(body) {
  const map = new Map();
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim();
      if (!map.has(current)) map.set(current, []);
      continue;
    }
    if (current) map.get(current).push(line);
  }
  const out = new Map();
  for (const [key, lines] of map) out.set(key, lines.join('\n').trim());
  return out;
}

function field(sec, key) {
  const value = sec.get(key) ?? '';
  return typeof value === 'string' ? value.trim() : '';
}

/** Todos os blocos ```json de um texto, parseados; ignora os que não são JSON. */
function fencedJson(text) {
  const out = [];
  const re = /```(?:json)?\s*\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(text))) {
    try {
      out.push(JSON.parse(match[1]));
    } catch {
      /* bloco não-JSON: ignora */
    }
  }
  return out;
}

/** Temas embutidos + ids já presentes em `themes/`. */
function availableThemes() {
  const set = new Set(BUILTIN_THEMES);
  try {
    for (const file of readdirSync(join(process.cwd(), 'themes'))) {
      if (!file.endsWith('.json')) continue;
      try {
        const doc = JSON.parse(readFileSync(join(process.cwd(), 'themes', file), 'utf8'));
        if (doc && typeof doc.id === 'string') set.add(doc.id);
      } catch {
        /* arquivo inválido no repo: o CI pega */
      }
    }
  } catch {
    /* sem pasta themes/ (execução fora do repo) */
  }
  return set;
}

function isTheme(doc) {
  return doc && typeof doc === 'object' && Array.isArray(doc.palette);
}

function isDiagram(doc) {
  return doc && typeof doc === 'object' && Array.isArray(doc.nodes);
}

export function triage(body) {
  const sec = sections(body);
  const themeField = sec.get('Theme JSON') ?? '';
  const diagramField = sec.get('Diagram JSON') ?? '';

  // Formulário de tema: o campo "Theme JSON" traz o objeto completo do tema.
  if (themeField) {
    const doc = fencedJson(themeField)[0];
    if (!doc) {
      return {
        ok: false,
        kind: 'theme',
        id: '',
        file: '',
        errors: ['Could not parse a JSON object from the "Theme JSON" field.'],
      };
    }
    const id = safeId(doc.id);
    return {
      ok: isTheme(doc) && validateTheme(doc, `themes/${id}.json`).length === 0,
      kind: 'theme',
      id: typeof doc.id === 'string' ? doc.id : '',
      file: `themes/${id}.json`,
      errors: validateTheme(doc, `themes/${id}.json`),
    };
  }

  // Formulário de template: slug/nome/descrição/tema em campos, diagrama em "Diagram JSON".
  if (diagramField) {
    const diagram = fencedJson(diagramField)[0];
    const slug = field(sec, 'Slug');
    const name = field(sec, 'Name');
    const description = field(sec, 'Description');
    const theme = field(sec, 'Theme');
    if (!diagram || !isDiagram(diagram)) {
      return {
        ok: false,
        kind: 'template',
        id: slug,
        file: '',
        errors: ['Could not parse a diagram object from the "Diagram JSON" field.'],
      };
    }
    const doc = { slug, name, description, theme, data: diagram };
    const file = `templates/${safeId(theme) || 'unknown'}/${safeId(slug) || 'template'}.json`;
    return {
      ok: validateTemplate(doc, file, availableThemes()).length === 0,
      kind: 'template',
      id: slug,
      file,
      errors: validateTemplate(doc, file, availableThemes()),
    };
  }

  // Fallback: um bloco JSON solto no corpo (pode vir de um issue antigo/manual).
  const docs = fencedJson(body);
  const doc = docs.find(isTheme) ?? docs.find(isDiagram);
  if (isTheme(doc)) {
    const id = safeId(doc.id);
    return {
      ok: validateTheme(doc, `themes/${id}.json`).length === 0,
      kind: 'theme',
      id: doc.id,
      file: `themes/${id}.json`,
      errors: validateTheme(doc, `themes/${id}.json`),
    };
  }
  if (isDiagram(doc)) {
    return {
      ok: false,
      kind: 'template',
      id: '',
      file: '',
      errors: ['Template submissions need the slug/name/description/theme fields from the form.'],
    };
  }
  return {
    ok: false,
    kind: 'unknown',
    id: '',
    file: '',
    errors: ['No "Theme JSON" or "Diagram JSON" field found in the issue body.'],
  };
}

function buildComment(verdict) {
  const contribute =
    'https://github.com/rodrigovirgilio/animated-motion-diagram-gallery/blob/main/CONTRIBUTING.md';
  if (verdict.ok) {
    return [
      '## ✅ Valid — awaiting adoption',
      '',
      `**${verdict.kind}** \`${verdict.id}\` passes validation.`,
      '',
      `A maintainer will add it as \`${verdict.file}\` in a pull request. The required ` +
        '`validate` check gates the merge and **Publish to Supabase** runs on merge.',
      '',
      `You can also open the pull request yourself — see [CONTRIBUTING.md](${contribute}).`,
    ].join('\n');
  }
  return [
    '## ❌ Needs changes',
    '',
    'Validation failed:',
    '',
    '```',
    ...verdict.errors,
    '```',
    '',
    'Please update the JSON — the check re-runs when you edit the issue. ' +
      `See [CONTRIBUTING.md](${contribute}) for the exact rules.`,
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--comment-file');
  const commentFile = idx !== -1 ? args[idx + 1] : null;
  const body = readStdin();
  const verdict = triage(body);
  if (commentFile) writeFileSync(commentFile, buildComment(verdict), 'utf8');
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
