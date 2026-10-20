// Frecuencia de literales cortos de UI (props típicos de componentes).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const roots = process.argv.slice(2);
const counts = new Map();
const PROPS = /(?:aria-label|title|placeholder|label|description|detail|message|status)\s*[=:]\s*['"`]([^'"`{}$]{2,70})['"`]/g;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!['.ts', '.tsx'].includes(extname(full)) || /\.spec\./.test(full)) continue;
    const code = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    let m;
    while ((m = PROPS.exec(code)) !== null) {
      const value = m[1].trim();
      if (value.length < 2) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
}
for (const root of roots) walk(root);
for (const [value, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
  console.log(String(count).padStart(3), JSON.stringify(value));
}
