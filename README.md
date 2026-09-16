# RDLC Report Designer

Editor visual de layouts de informes `.rdlc` de Business Central. Alternativa
moderna al Report Builder (obsoleto): Electron + React (lienzo Konva), backend
NestJS con arquitectura hexagonal y **XML lossless** como fuente de verdad.

> Documentación funcional: [`RDLC Report Designer.md`](./RDLC%20Report%20Designer.md)
> Arquitectura: [`RDLC Report Designer - arquitectura.md`](./RDLC%20Report%20Designer%20-%20arquitectura.md)
> Pendientes: [`RDLC Report Designer - Pendientes.md`](./RDLC%20Report%20Designer%20-%20Pendientes.md)

## Estructura

```
apps/back/            # Electron main + NestJS (hexágono: dominio/aplicación/presentación/infraestructura)
apps/front/           # React renderer — Tailwind v4 + shadcn/ui (preset radix-nova) + Konva
packages/contracts/   # @rdlc-designer/contracts — zod: comandos, proyección, IPC
fixtures/corpus/      # corpus de .rdlc versionado para golden tests
docs/adr/             # decisiones de arquitectura
docs/perf/            # líneas base de rendimiento
```

### UI (front)

- **shadcn/ui** con el preset `radix-nova` (CLI oficial): los componentes viven en
  `apps/front/src/components/ui/` y son nuestros (filosofía copy-in).
  Añadir más: `pnpm dlx shadcn@latest add <componente>` desde `apps/front`.
- **Tailwind v4** vía `@tailwindcss/vite`; tema y tokens en `apps/front/src/styles.css`.
- Iconos: `lucide-react`. Fuente: Geist.
- El alias `@/*` está configurado en `apps/front/tsconfig.json`, en su `vite.config.ts`
  y en `apps/back/electron.vite.config.ts` (build de Electron).

## Requisitos

- Node.js >= 22
- pnpm 9 (`npm install -g pnpm@9.15.4`)

## Comandos

```bash
pnpm install
pnpm test                       # vitest: golden round-trip, comparativa, caso de uso
pnpm typecheck                  # tsc en todos los paquetes
pnpm format                     # prettier
pnpm --filter @rdlc-designer/back dev     # Electron en modo dev (HMR renderer)
pnpm --filter @rdlc-designer/back build   # build de producción (main + preload + renderer)
```

### Troubleshooting

- **`Error: Electron uninstall` al arrancar en dev**: pnpm no ejecutó el
  postinstall de Electron (algunas configuraciones lo bloquean). Descarga el
  binario a mano: `node apps/back/node_modules/electron/install.js`.

### Benchmark del lienzo

```bash
# Electron abrirá la página de benchmark (972 textboxes, drag simulado 3 s)
$env:RDLC_BENCH='972'; pnpm --filter @rdlc-designer/back dev
```

El resultado (`[bench] {...}`) sale en consola/log y el estado actual está
documentado en [`docs/perf/0001-baseline-lienzo.md`](./docs/perf/0001-baseline-lienzo.md).


## Estado (Fase 0 cerrada · Fase 1 en curso — sesión 2026-09-14)

**Fase 0 (spike round-trip) — cerrada:**

- [x] Monorepo pnpm + turbo, TypeScript estricto.
- [x] `packages/contracts` v0: comandos, proyección completa, canales IPC, códigos de error.
- [x] Corpus de 10 ficheros + golden tests de round-trip **byte a byte** (10/10).
- [x] Decisión del parser: `xml-trueformat` ([ADR 0001](docs/adr/0001-parser-xml-lossless.md)).
- [x] Shell Electron + NestJS ([ADR 0002](docs/adr/0002-nest-en-electron-main.md)) + preload tipado.
- [x] File watching → re-parseo → snapshot nueva (recarga en vivo).
- [x] Benchmark de lienzo con 972 textboxes
      ([docs/perf/0001-baseline-lienzo.md](docs/perf/0001-baseline-lienzo.md)).

**Fase 1 (editor de layout) — en curso:**

- [x] Árbol de dominio lossless + comandos con inverso (undo byte-exacto) y journal.
- [x] **Validación XSD oficial RDL 2016/01** (avisa al importar, bloquea al guardar).
- [x] Lienzo: papel + márgenes + bandas, reglas mm/cm, selección, drag con imán,
      flechas 1pt/10pt, zoom Ctrl+rueda, placeholder de imágenes.
- [x] Insertar / duplicar / eliminar items; auto-crecimiento del contenedor.
- [x] **Insertar arrastrando desde la toolbar + menú contextual** (insertar, duplicar,
      copiar, cortar, pegar, eliminar) con portapapeles en el backend.
- [x] Paneles: propiedades, texto/expresión, imagen (origen/MIME/tamaño/padding),
      variables (búsqueda + colapsables), Propiedades del informe (página + Código VB).
- [x] Barra de formato con **fuentes del sistema** (registro de Windows vía IPC).
- [x] **Paleta de comandos Ctrl+K** (elementos por nombre y contenido, variables, acciones)
      y **Monaco** para expresiones y bloque `<Code>` (resaltado + autocompletado;
      las variables se insertan en el cursor).
- [x] **Redimensionar con el cursor** (8 tiradores: mover + tamaño en un undo) y, en los
      Tablix, redimensionar la tabla con reparto proporcional de su rejilla.
- [ ] **Tablix visual completo** (F2): separadores internos, celdas, filas/columnas y grupos con totales · [ ] Matrix (F3).

Estado detallado y punto de retomada: [`RDLC Report Designer - Pendientes.md`](./RDLC%20Report%20Designer%20-%20Pendientes.md).

