import { loadGallery } from './lib.mjs';

const { templates, themes, errors } = loadGallery();

if (errors.length) {
  console.error(`\n✗ ${errors.length} problem(s) found:\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ ${templates.length} template(s) and ${themes.length} theme(s) are valid`);
