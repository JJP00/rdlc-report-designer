/**
 * Capturas y GIF del README sobre la app real (Playwright `_electron`), en inglés.
 *
 *   pnpm --filter @rdlc-designer/back build:e2e      # build con los hooks __rdlc*
 *   node apps/back/scripts/readme-media.mjs docs/assets [escena,escena…]
 *
 * Cada escena (`readme-media/scenes/<escena>.mjs`) lanza la app con **copias**
 * del corpus (la app tiene watcher) y guarda el PNG o GIF que enlaza el README.
 * Los GIF necesitan `ffmpeg` en el PATH. Desde el terminal de VS Code hay que
 * quitar `ELECTRON_RUN_AS_NODE` (`env -u ELECTRON_RUN_AS_NODE node …`).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { INVOICE, close, launch } from './readme-media/lib.mjs';

/** Orden de ejecución; cada nombre es un fichero de `readme-media/scenes`. */
const SCENES = ['hero', 'palette', 'panels', 'expression', 'code', 'text', 'problems', 'conflict'];

const outDir = resolve(process.argv[2] ?? 'docs/assets');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const unknown = (only ?? []).filter((name) => !SCENES.includes(name));
if (unknown.length > 0) {
  console.log(`escenas desconocidas: ${unknown.join(', ')} (hay: ${SCENES.join(', ')})`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
let failed = false;
for (const name of SCENES) {
  if (only && !only.includes(name)) continue;
  const scene = await import(`./readme-media/scenes/${name}.mjs`);
  const ctx = await launch(scene.files ?? [INVOICE], outDir);
  try {
    await scene.default(ctx);
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
  } finally {
    await close(ctx);
  }
}
process.exit(failed ? 1 : 0);
