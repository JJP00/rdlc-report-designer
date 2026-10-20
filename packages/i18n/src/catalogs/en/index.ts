/**
 * Catálogo **fuente** (EN): sus hojas `as const` definen el tipo de claves
 * (`MessageKey`). En fase 1 de i18n el orden del barrido es: toolbar → paneles
 * → diálogos → paleta/pie → diálogos nativos.
 */
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

export const en = {
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
} as const;

export type EnCatalog = typeof en;
