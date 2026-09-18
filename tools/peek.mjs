import { readFileSync } from 'node:fs';

const raw = readFileSync('src/components/AppLayout.vue', 'utf8');
const lines = raw.split(/\r?\n/);
lines.forEach((l, i) => {
  if (/LOGO_SOURCES|brandImage|logoUrl|onLogoError|logo\.png/.test(l)) {
    console.log((i + 1) + ' | ' + l);
  }
});
console.log('--- lines:', lines.length);