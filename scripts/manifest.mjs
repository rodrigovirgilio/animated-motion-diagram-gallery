import { readFileSync, writeFileSync } from 'node:fs';
import { buildManifest, serializeManifest } from './lib.mjs';

const check = process.argv.includes('--check');
const manifest = buildManifest();
const output = serializeManifest(manifest);
const file = 'manifest.json';

if (!check) {
  writeFileSync(file, output);
  console.log(
    `✓ manifest.json written (${manifest.templates.length} template(s), ${manifest.themes.length} theme(s))`,
  );
  process.exit(0);
}

let current = '';
try {
  current = readFileSync(file, 'utf8');
} catch {
  console.error('✗ manifest.json is missing — run `npm run manifest` and commit the result');
  process.exit(1);
}

if (current !== output) {
  console.error('✗ manifest.json is out of date — run `npm run manifest` and commit the result');
  process.exit(1);
}

console.log('✓ manifest.json is up to date');
