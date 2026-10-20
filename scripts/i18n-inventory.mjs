// Inventario rápido de literales de texto de UI (medición para i18n).
// Uso: node scripts/i18n-inventory.mjs [dir...]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('apps/front/src', 'apps/back/src');

const SPANISH = /[áéíóúüñ¿¡«»]|\b(el|la|los|las|un|una|de|del|que|con|por|para|no|sin|se|al|es|en|y|o|c[oó]mo|qu[eé])\b/i;
const counts = new Map();
const perFile = new Map();

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'out') continue;
      walk(full);
      continue;
    }
    if (!['.ts', '.tsx'].includes(extname(full))) continue;
    if (/\.spec\./.test(full)) continue;
    scan(full);
  }
}

const LITERAL = /(['"`])((?:\\.|(?!\1).){2,120}?)\1/g;

function scan(file) {
  const source = readFileSync(file, 'utf8');
  // Quita comentarios de forma bruta para no contar prosa de comentarios.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  let match;
  while ((match = LITERAL.exec(code)) !== null) {
    const value = match[2].replace(/\\n/g, '\n');
    if (value.length < 3 || /^[\w./:@#$%^&*()[\]{}=+,<>|~ -]+$/.test(value)) continue; // sin palabras legibles
    if (!SPANISH.test(value)) continue;
    if (/\.(rdlc|rdl|ts|tsx|js|json|css|png|svg)$/.test(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (!perFile.has(file)) perFile.set(file, []);
    perFile.get(file).push(value);
  }
}

for (const root of roots) walk(root);

const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
console.log('=== literales repetidos (>=3) ===');
for (const [value, count] of top) {
  if (count < 3) break;
  console.log(`${String(count).padStart(3)}  ${JSON.stringify(value.length > 90 ? value.slice(0, 90) + '…' : value)}`);
}
const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(`\n=== total: ${total} ocurrencias, ${counts.size} distintas, en ${perFile.size} ficheros ===`);
