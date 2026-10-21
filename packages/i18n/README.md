# `@rdlc-designer/i18n`

i18n compartida por **main** y **renderer**: catálogos ICU con claves tipadas,
resolución de idioma (preferencia → SO → EN, override `RDLC_LOCALE`),
pseudo-idioma de desarrollo y binding React.

Plan y decisiones: [`docs/features/0005-i18n.md`](../../docs/features/0005-i18n.md).
Voz, presupuestos y anti-patrones: [`docs/ux/0006-guia-microcopy.md`](../../docs/ux/0006-guia-microcopy.md).

## API

```tsx
// Renderer (React)
import { useT, useTranslator, useLocale } from '@rdlc-designer/i18n/react';
import { LOCALE_LABELS } from '@rdlc-designer/i18n';

const t = useT();
t('common.cancel');                       // 'Cancelar' / 'Cancel'
t('status.reloads', { count: 3 });        // ICU: plural real

// Main (sin React)
import { createTranslator } from '@rdlc-designer/i18n';
const t = createTranslator('en').t;
```

- `t(key, params?)` — claves **tipadas** derivadas del catálogo EN: una clave
  inexistente rompe `tsc`.
- `useTranslator()` — traductor completo (para `translateError`, `tUnsafe`).
- `createTranslatorFor('es-ES')` / `createTranslator('qps-ploc')` — idioma
  efectivo (normaliza BCP 47; pseudo-idioma de dev).

## Convenciones de catálogo

- **El catálogo EN es la fuente** (`catalogs/en/*`): sus hojas `as const`
  definen las claves. ES (`catalogs/es/*`) se valida por estructura (`satisfies`
  en `es/index.ts`) y con `parity.spec.ts`.
- **Claves**: `<namespace>.<contexto>.<nombre>` en
  `camelCase` — `toolbar.file.new`, `panels.properties.name`,
  `text.editor.mixedBadge`.
- **ICU MessageFormat** (wrapper `intl-messageformat`):
  - Interpolación: `'No existe el elemento {id}'`.
  - Plurales **reales** con las reglas CLDR: `'{count, plural, one {1 problema} other {# problemas}}'`
    — nunca `(s)`, nunca abreviar.
  - `select`: `'{mode, select, visible {Visible} hidden {Oculta} other {…}}'`.
- **Comillas simples**: en un patrón ICU, una comilla literal se escribe
  **doble** (`''`) y las llaves interpoladas que van *entre* comillas también:
  - ES: `"No existe el elemento ''{id}''"` (TS: comillas dobles; prettier lo
    mantiene porque el valor contiene `'`).
  - `parity.spec.ts` falla si la interpolación no se sustituye o si hay
    apóstrofos impares.
- **No concatena frases**: `'Copiados {count} elementos'` (ICU), no
  `'Copiados ' + n + ' elementos'`.

## No traducir (nunca)

`Fields!`, `Parameters!`, `Globals!`, `User!`, `ReportItems!`, funciones VB,
`Code.`, nombres de items (`Textbox1`), extensiones (`.rdlc`/`.rdl`), unidades
(`pt`, `cm`, `mm`), jerga del XSD (`CanGrow`, `KeepTogether`, `ZIndex`,
`Group on`/`And on`), atajos (`Ctrl+K`), `data-testid`, clases CSS, claves de
`storage`, variables `RDLC_*`, y **el contenido del informe** (textos, nombres,
expresiones). La marca `RDLC Report Designer` es invariable.

## Barrido por módulos (fase 1)

Cada módulo tiene su **namespace de catálogo** (no se comparten ficheros entre
agentes; si falta una cadena compartida, vive en el namespace del módulo hasta
la consolidación):

| Módulo (barrido)       | Namespace(s) `catalogs/{en,es}/` | Ficheros                                          |
| ---------------------- | -------------------------------- | ------------------------------------------------- |
| shell                  | `app`, `dialogs`                 | diálogos, banners, pestañas, `useWorkspace`…      |
| toolbar                | `toolbar`                        | toolbar, format bar, breadcrumb, CanvasArea       |
| canvas                 | `canvas`                         | `components/canvas/*`, `canvasA11y`               |
| panels-item            | `panels`                         | paneles de propiedades del item                   |
| panels-text            | `text`                           | texto/expresiones/runs                            |
| panels-image-report    | `image`, `report`                | imagen, propiedades del informe, variables        |
| panels-tablix          | `tablix`                         | estructura/grupos/filtros/jerarquía               |
| palette-status         | `palette`, `status`              | paleta Ctrl+K y pie                              |
| libs                   | `lib`                            | utilidades de front con texto visible             |
| back                   | `native`                         | diálogos nativos del main (Buyer no toca)         |
| errores (fase 2)       | `errors`                         | `domainError` + comandos + tests                  |

**Congelados** (no editar fuera de su módulo): `common`, `catalogs/*/index.ts`,
`catalog.ts`, `translate.ts`, `locale.ts`, `pseudo.ts`, `react.tsx`,
`parity.spec.ts`.

## Fase 1: extracción byte a byte

1. El valor **ES** debe ser **byte a byte** el texto que había hardcodeado
   (salvo los recortes exactos del barrido de microcopy ya acordados).
2. El **EN** se redacta (no se traduce): registro Microsoft/VS Code, directo,
   presupuestos de la guía de microcopy.
3. Los `aria-label` se convierten igual (son la voz de la app para lectores de
   pantalla).
4. Los tests unitarios que afirmen textos ES siguen verdes (extracción byte a
   byte); solo cambian los del barrido de microcopy.

## Verificación

```bash
pnpm --filter @rdlc-designer/i18n test          # paridad + ICU de TODO el catálogo
pnpm --filter @rdlc-designer/front typecheck
pnpm --filter @rdlc-designer/front test
pnpm --filter @rdlc-designer/back typecheck && pnpm --filter @rdlc-designer/back test
```

Pseudo-idioma (layout, expansión ~150 %): `RDLC_LOCALE=qps-ploc pnpm --filter @rdlc-designer/back dev`.
