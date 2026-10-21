/**
 * Catálogo ES. La compilación garantiza (vía `satisfies`) que tiene **todas**
 * las claves del catálogo fuente; `parity.spec.ts` añade las comprobaciones de
 * claves sobrantes, valores vacíos e interpolación real.
 */
import type { CatalogShape } from '../../catalog.js';
import type { EnCatalog } from '../en/index.js';
import { app } from './app.js';
import { canvas } from './canvas.js';
import { common } from './common.js';
import { dialogs } from './dialogs.js';
import { errors } from './errors.js';
import { image } from './image.js';
import { lib } from './lib.js';
import { native } from './native.js';
import { palette } from './palette.js';
import { panels } from './panels.js';
import { report } from './report.js';
import { status } from './status.js';
import { tablix } from './tablix.js';
import { text } from './text.js';
import { toolbar } from './toolbar.js';

export const es = {
  common,
  app,
  dialogs,
  toolbar,
  canvas,
  panels,
  text,
  image,
  report,
  tablix,
  palette,
  status,
  lib,
  native,
  errors,
} as const satisfies CatalogShape<EnCatalog>;
